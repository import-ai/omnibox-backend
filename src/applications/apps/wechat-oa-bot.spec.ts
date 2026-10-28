import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { Applications } from 'omniboxd/applications/applications.entity';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { Repository } from 'typeorm';

import { WechatOaBot } from './wechat-oa-bot';

const KEY = '0123456789abcdef0123456789abcdef';

describe('WechatOaBot', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  let repository: {
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
  };
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    getOne: jest.Mock;
  };
  let apiKeyService: { create: jest.Mock; delete: jest.Mock };
  let namespacesService: { getPrivateRootId: jest.Mock };

  const createBot = (baseUrl = 'http://bot.local/') => {
    const configService = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'OBBOT_BASE_URL' ? baseUrl : fallback,
      ),
    } as unknown as ConfigService;
    const i18n = {
      t: jest.fn((key: string) => key),
    } as unknown as I18nService;
    return new WechatOaBot(
      repository as unknown as Repository<Applications>,
      apiKeyService as unknown as APIKeyService,
      namespacesService as unknown as NamespacesService,
      i18n,
      configService,
    );
  };

  const jsonResponse = (body: unknown, ok = true, status = 200) =>
    ({ ok, status, json: () => Promise.resolve(body) }) as Response;

  beforeEach(() => {
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    repository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      save: jest.fn((entity: Applications) => Promise.resolve(entity)),
    };
    apiKeyService = {
      create: jest.fn().mockResolvedValue({ id: 'api-key-id' }),
      delete: jest.fn(),
    };
    namespacesService = {
      getPrivateRootId: jest.fn().mockResolvedValue('private-root-id'),
    };
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('stores the parametric QR code returned by the bot', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        qrcode_content: 'http://weixin.qq.com/q/abc',
        qrcode_expires_at: '2026-11-19T00:00:00+00:00',
      }),
    );

    const attrs = await createBot().getAttrs('ns', 'user');

    expect(attrs).toEqual({
      key: expect.stringMatching(/^[0-9a-f]{32}$/),
      qrcode_content: 'http://weixin.qq.com/q/abc',
      qrcode_expires_at: '2026-11-19T00:00:00.000Z',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://bot.local/api/v1/wechat_oa/binding-qrcode',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ key: attrs.key }),
      }),
    );
  });

  it('never reuses a binding key, so an old QR code cannot match a later binding', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          qrcode_content: 'http://weixin.qq.com/q/abc',
          qrcode_expires_at: '2026-11-19T00:00:00Z',
        }),
      ),
    );
    const bot = createBot();

    const keys = new Set<string>();
    for (let i = 0; i < 50; i++) {
      keys.add((await bot.getAttrs('ns', 'user')).key);
    }

    expect(keys.size).toBe(50);
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('rejects the callback for a key that is no longer pending', async () => {
    queryBuilder.getOne.mockResolvedValue(null);

    await expect(
      createBot().callback({ key: KEY, primary_key: 'openid' } as {
        key: string;
      }),
    ).rejects.toMatchObject({ code: 'INVALID_VERIFY_CODE' });
    expect(apiKeyService.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a failed bot request', jsonResponse({}, false, 503)],
    [
      'a non-WeChat QR code',
      jsonResponse({
        qrcode_content: 'https://example.com/q/abc',
        qrcode_expires_at: '2026-11-19T00:00:00Z',
      }),
    ],
    [
      'an unparsable expiry',
      jsonResponse({
        qrcode_content: 'https://weixin.qq.com/q/abc',
        qrcode_expires_at: 'soon',
      }),
    ],
  ])('rejects %s', async (_name, response) => {
    fetchMock.mockResolvedValue(response);

    await expect(createBot().getAttrs('ns', 'user')).rejects.toMatchObject({
      code: 'BINDING_REQUEST_FAILED',
    });
  });

  it('rejects when the bot is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(createBot().getAttrs('ns', 'user')).rejects.toThrow(
      AppException,
    );
  });

  it('rejects without calling the bot when OBBOT_BASE_URL is unset', async () => {
    await expect(createBot('').getAttrs('ns', 'user')).rejects.toThrow(
      AppException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps only primary_key in attrs after the binding callback', async () => {
    const entity = {
      appId: 'wechat_oa_bot',
      userId: 'user',
      namespaceId: 'ns',
      attrs: {
        key: KEY,
        qrcode_content: 'http://weixin.qq.com/q/abc',
        qrcode_expires_at: '2026-11-19T00:00:00.000Z',
      },
    } as unknown as Applications;
    queryBuilder.getOne.mockResolvedValue(entity);

    const result = await createBot().callback({
      key: KEY,
      primary_key: 'openid',
    } as { key: string });

    expect(entity.attrs).toEqual({ primary_key: 'openid' });
    expect(entity.apiKeyId).toBe('api-key-id');
    expect(result.application.attrs).toEqual({ primary_key: 'openid' });
  });
});
