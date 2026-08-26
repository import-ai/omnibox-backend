import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CacheService } from 'omniboxd/common/cache.service';

import { WechatJsSdkService } from './wechat-js-sdk.service';

describe('WechatJsSdkService', () => {
  const config: Record<string, string> = {
    OBB_WECHAT_APP_ID: 'official-account-id',
    OBB_WECHAT_APP_SECRET: 'official-account-secret',
    OBB_WECHAT_APP_NATIVE_ID: 'mobile-app-id',
    OB_STATIC_PROXY: 'http://proxy.example:8080',
    OBB_WECHAT_JS_SDK_ALLOWED_HOSTS:
      'test.omnibox.pro,pre.omnibox.pro,www.omnibox.pro',
  };
  const configService = {
    get: jest.fn((key: string, fallback = '') => config[key] ?? fallback),
  } as unknown as ConfigService;
  const cacheGet = jest.fn();
  const cacheSet = jest.fn();
  const cacheService = {
    get: cacheGet,
    set: cacheSet,
  } as unknown as CacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheGet.mockReset();
    cacheSet.mockReset();
    jest.spyOn(Date, 'now').mockReturnValue(1_725_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a SHA-1 signature for an allowed share URL', async () => {
    cacheGet.mockResolvedValue('cached-ticket');
    const service = new WechatJsSdkService(configService, cacheService);

    const result = await service.createSignature(
      'https://test.omnibox.pro/zh-cn/conversation-share/?share_id=share-1#reply',
    );

    expect(result.appId).toBe('official-account-id');
    expect(result.mobileAppId).toBe('mobile-app-id');
    expect(result.timestamp).toBe(1_725_000_000);
    expect(result.nonceStr).toMatch(/^[a-f0-9]{32}$/);
    expect(result.signature).toBe(
      createHash('sha1')
        .update(
          `jsapi_ticket=cached-ticket&noncestr=${result.nonceStr}&timestamp=1725000000&url=https://test.omnibox.pro/zh-cn/conversation-share/?share_id=share-1`,
        )
        .digest('hex'),
    );
  });

  it('accepts other HTTPS pages on a configured host for shared consumers', async () => {
    cacheGet.mockResolvedValue('cached-ticket');
    const service = new WechatJsSdkService(configService, cacheService);

    await expect(
      service.createSignature(
        'https://test.omnibox.pro/zh-cn/?invite_code=123456',
      ),
    ).resolves.toEqual(
      expect.objectContaining({ appId: 'official-account-id' }),
    );
  });

  it('fetches WeChat credentials through the configured proxy and caches them', async () => {
    cacheGet.mockResolvedValue(null);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'access-token', expires_in: 7200 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errcode: 0,
            ticket: 'jsapi-ticket',
            expires_in: 7200,
          }),
          { status: 200 },
        ),
      );
    const service = new WechatJsSdkService(configService, cacheService);

    await service.createSignature(
      'https://www.omnibox.pro/zh-cn/conversation-share/?share_id=share-1',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/cgi-bin/token?'),
      expect.objectContaining({
        dispatcher: expect.anything(),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/cgi-bin/ticket/getticket?'),
      expect.objectContaining({
        dispatcher: expect.anything(),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(cacheSet).toHaveBeenCalledWith(
      '/wechat-js-sdk',
      'access-token',
      'access-token',
      6_900_000,
    );
    expect(cacheSet).toHaveBeenCalledWith(
      '/wechat-js-sdk',
      'jsapi-ticket',
      'jsapi-ticket',
      6_900_000,
    );
  });

  it('rejects URLs outside configured share hosts', async () => {
    const service = new WechatJsSdkService(configService, cacheService);

    await expect(
      service.createSignature('https://attacker.example/conversation-share/'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('shares credential requests between concurrent signatures', async () => {
    cacheGet.mockResolvedValue(null);
    let resolveAccessToken!: (response: Response) => void;
    const accessTokenResponse = new Promise<Response>((resolve) => {
      resolveAccessToken = resolve;
    });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(() => accessTokenResponse)
      .mockResolvedValueOnce(
        Response.json({ errcode: 0, ticket: 'jsapi-ticket', expires_in: 7200 }),
      );
    const service = new WechatJsSdkService(configService, cacheService);

    const signatures = Promise.all([
      service.createSignature('https://test.omnibox.pro/en/'),
      service.createSignature('https://test.omnibox.pro/zh-cn/'),
      service.createSignature(
        'https://test.omnibox.pro/en/?invite_code=123456',
      ),
    ]);
    await new Promise(setImmediate);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveAccessToken(
      Response.json({ access_token: 'access-token', expires_in: 7200 }),
    );
    await expect(signatures).resolves.toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports missing WeChat credentials', async () => {
    const missingConfig = {
      get: jest.fn((_key: string, fallback = '') => fallback),
    } as unknown as ConfigService;
    const service = new WechatJsSdkService(missingConfig, cacheService);

    await expect(
      service.createSignature(
        'https://test.omnibox.pro/zh-cn/conversation-share/',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reports a missing WeChat mobile App ID', async () => {
    const missingNativeIdConfig = {
      get: jest.fn((key: string, fallback = '') =>
        key === 'OBB_WECHAT_APP_NATIVE_ID'
          ? fallback
          : (config[key] ?? fallback),
      ),
    } as unknown as ConfigService;
    const service = new WechatJsSdkService(missingNativeIdConfig, cacheService);

    await expect(
      service.createSignature(
        'https://test.omnibox.pro/zh-cn/conversation-share/',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
