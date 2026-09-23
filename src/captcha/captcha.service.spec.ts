import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CaptchaService } from './captcha.service';

const verifyIntelligentCaptcha = jest.fn();

jest.mock('@alicloud/captcha20230305', () => {
  class MockClient {
    verifyIntelligentCaptcha = verifyIntelligentCaptcha;
  }
  class VerifyIntelligentCaptchaRequest {
    constructor(public readonly map: Record<string, unknown>) {
      Object.assign(this, map);
    }
  }
  return {
    __esModule: true,
    default: MockClient,
    VerifyIntelligentCaptchaRequest,
  };
});

const FULL_CONFIG: Record<string, string> = {
  OBB_CAPTCHA_ACCESS_KEY_ID: 'key-id',
  OBB_CAPTCHA_ACCESS_KEY_SECRET: 'key-secret',
  OBB_CAPTCHA_PREFIX: 'abc123',
  OBB_CAPTCHA_SCENE_ID_WEB: 'scene-web',
  OBB_CAPTCHA_SCENE_ID_APP: 'scene-app',
};

/**
 * Mirrors what @alicloud/captcha20230305 actually throws: an
 * openapi-core ClientError/ServerError, i.e. a $dara.ResponseError subclass
 * whose message is `${code}: ${message}` and which carries a string `code` and
 * a numeric `statusCode`.
 */
class FakeAlibabaCloudError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  readonly data: Record<string, unknown>;

  constructor(code: string, message: string, statusCode?: number) {
    super(`${code}: ${message}`);
    this.name = 'ClientError';
    this.code = code;
    this.statusCode = statusCode;
    this.data = { Code: code, Message: message, statusCode };
  }
}

function sdkError(code: string, message: string, statusCode?: number): Error {
  return new FakeAlibabaCloudError(code, message, statusCode);
}

/** Node-level network errors also expose `code`, but never a credential one. */
function nodeError(code: string): Error {
  return Object.assign(new Error(code), { code, syscall: 'connect' });
}

async function createService(
  config: Record<string, string>,
): Promise<CaptchaService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CaptchaService,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn(
            (key: string, defaultValue = '') => config[key] ?? defaultValue,
          ),
        },
      },
    ],
  }).compile();
  return module.get(CaptchaService);
}

describe('CaptchaService', () => {
  beforeEach(() => {
    verifyIntelligentCaptcha.mockReset();
  });

  describe('enabled', () => {
    it('is true when all five variables are set', async () => {
      const service = await createService(FULL_CONFIG);
      expect(service.enabled).toBe(true);
    });

    it.each(Object.keys(FULL_CONFIG))(
      'is false when %s is missing',
      async (missingKey) => {
        const config = { ...FULL_CONFIG, [missingKey]: '' };
        const service = await createService(config);
        expect(service.enabled).toBe(false);
      },
    );
  });

  describe('getPublicConfig', () => {
    it('returns the public config with snake_case scene ids', async () => {
      const service = await createService(FULL_CONFIG);
      expect(service.getPublicConfig()).toEqual({
        enabled: true,
        prefix: 'abc123',
        region: 'cn',
        scene_ids: { web: 'scene-web', app: 'scene-app' },
      });
    });

    it('reports disabled when not configured', async () => {
      const service = await createService({});
      expect(service.getPublicConfig()).toEqual({
        enabled: false,
        prefix: '',
        region: 'cn',
        scene_ids: { web: '', app: '' },
      });
    });
  });

  describe('verify', () => {
    it('passes when verifyResult is true', async () => {
      verifyIntelligentCaptcha.mockResolvedValue({
        body: { result: { verifyResult: true, verifyCode: 'T' } },
      });
      const service = await createService(FULL_CONFIG);

      const result = await service.verify('param', 'web');

      expect(result).toEqual({ passed: true, code: 'T' });
      expect(verifyIntelligentCaptcha).toHaveBeenCalledWith(
        expect.objectContaining({
          sceneId: 'scene-web',
          captchaVerifyParam: 'param',
        }),
      );
    });

    it('uses the app scene id for app clients', async () => {
      verifyIntelligentCaptcha.mockResolvedValue({
        body: { result: { verifyResult: true } },
      });
      const service = await createService(FULL_CONFIG);

      await service.verify('param', 'app');

      expect(verifyIntelligentCaptcha).toHaveBeenCalledWith(
        expect.objectContaining({ sceneId: 'scene-app' }),
      );
    });

    it('fails with the verify code when verifyResult is false', async () => {
      verifyIntelligentCaptcha.mockResolvedValue({
        body: { result: { verifyResult: false, verifyCode: 'F' } },
      });
      const service = await createService(FULL_CONFIG);

      expect(await service.verify('param', 'web')).toEqual({
        passed: false,
        code: 'F',
      });
    });

    it('fails when the response has no result', async () => {
      verifyIntelligentCaptcha.mockResolvedValue({
        body: { code: 'InvalidParam' },
      });
      const service = await createService(FULL_CONFIG);

      expect(await service.verify('param', 'web')).toEqual({
        passed: false,
        code: 'InvalidParam',
      });
    });

    it('fails open when the SDK throws', async () => {
      verifyIntelligentCaptcha.mockRejectedValue(new Error('timeout'));
      const service = await createService(FULL_CONFIG);

      expect(await service.verify('param', 'web')).toEqual({
        passed: true,
        code: 'ERROR',
      });
    });

    it.each([
      ['a connect timeout', sdkError('SDK.HttpError', 'ETIMEDOUT')],
      ['a connection reset', nodeError('ECONNRESET')],
      ['a DNS failure', nodeError('ENOTFOUND')],
      ['an Aliyun 5xx', sdkError('InternalError', 'boom', 500)],
      ['a 404 without a credential code', sdkError('NotFound', 'gone', 404)],
      ['a plain string rejection', 'nope'],
    ])('keeps failing open on %s', async (_label, error) => {
      verifyIntelligentCaptcha.mockRejectedValue(error);
      const service = await createService(FULL_CONFIG);

      expect(await service.verify('param', 'web')).toEqual({
        passed: true,
        code: 'ERROR',
      });
    });

    it.each([
      // Both of these were observed for real against Aliyun.
      [
        'InvalidAccessKeyId.NotFound',
        sdkError(
          'InvalidAccessKeyId.NotFound',
          'Specified access key is not found',
          404,
        ),
      ],
      [
        'Forbidden.NoPermission',
        sdkError(
          'Forbidden.NoPermission',
          'You are not authorized to perform this action',
          403,
        ),
      ],
      [
        'Forbidden.RAMUserAccessDenied',
        sdkError('Forbidden.RAMUserAccessDenied', 'denied', 403),
      ],
      [
        'SignatureDoesNotMatch',
        sdkError('SignatureDoesNotMatch', 'bad signature', 400),
      ],
      [
        'an unknown code with a 403 status',
        sdkError('Something.Unknown', 'denied', 403),
      ],
      [
        'an unknown code with a 401 status',
        sdkError('Something.Unknown', 'denied', 401),
      ],
    ])('fails closed on %s', async (_label, error) => {
      verifyIntelligentCaptcha.mockRejectedValue(error);
      const service = await createService(FULL_CONFIG);

      expect(await service.verify('param', 'web')).toEqual({
        passed: false,
        code: 'CREDENTIAL_ERROR',
      });
    });

    it('passes without calling the SDK when disabled', async () => {
      const service = await createService({});

      expect(await service.verify('param', 'web')).toEqual({
        passed: true,
        code: 'DISABLED',
      });
      expect(verifyIntelligentCaptcha).not.toHaveBeenCalled();
    });
  });
});
