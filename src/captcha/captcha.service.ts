import Captcha20230305, * as $Captcha20230305 from '@alicloud/captcha20230305';
import * as $OpenApi from '@alicloud/openapi-client';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type CaptchaScene = 'web' | 'app';

export interface CaptchaVerifyResult {
  passed: boolean;
  code?: string;
}

export interface CaptchaPublicConfig {
  enabled: boolean;
  prefix: string;
  region: string;
  scene_ids: {
    web: string;
    app: string;
  };
}

const CAPTCHA_ENDPOINT = 'captcha.cn-shanghai.aliyuncs.com';
const CAPTCHA_REGION = 'cn';
const CAPTCHA_TIMEOUT_MS = 5000;

/**
 * Aliyun error-code families that mean "this deployment cannot authenticate or
 * is not allowed to call VerifyIntelligentCaptcha" - a permanent server
 * misconfiguration rather than a transient outage.
 *
 * The SDK (@alicloud/captcha20230305 -> @alicloud/openapi-core) throws
 * ClientError/ServerError, both extending AlibabaCloudError ->
 * $dara.ResponseError, which carry a string `code` taken verbatim from the
 * Aliyun error body (e.g. 'InvalidAccessKeyId.NotFound',
 * 'Forbidden.NoPermission') plus a numeric `statusCode`. Matching is done
 * lowercased against the family name so both the bare code and the dotted
 * variants ('Forbidden.RAMUserAccessDenied') are covered. Node-level failures
 * (ECONNRESET, ENOTFOUND, ETIMEDOUT, ...) also expose `code`, but never one of
 * these, so they stay in the fail-open branch.
 */
const CREDENTIAL_ERROR_CODE_FAMILIES = [
  'invalidaccesskeyid',
  'missingaccesskeyid',
  'nosuchaccesskey',
  'signaturedoesnotmatch',
  'invalidsecuritytoken',
  'missingsecuritytoken',
  'invalidcredential',
  'forbidden',
  'nopermission',
  'accessdenied',
  'unauthorized',
  'unauthorizedoperation',
];

/** 401/403 mean the same thing even when the code is one we do not know yet. */
const CREDENTIAL_ERROR_STATUS_CODES = [401, 403];

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly client: Captcha20230305 | null = null;
  private readonly prefix: string;
  private readonly sceneIds: Record<CaptchaScene, string>;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>(
      'OBB_CAPTCHA_ACCESS_KEY_ID',
      '',
    );
    const accessKeySecret = this.configService.get<string>(
      'OBB_CAPTCHA_ACCESS_KEY_SECRET',
      '',
    );
    this.prefix = this.configService.get<string>('OBB_CAPTCHA_PREFIX', '');
    this.sceneIds = {
      web: this.configService.get<string>('OBB_CAPTCHA_SCENE_ID_WEB', ''),
      app: this.configService.get<string>('OBB_CAPTCHA_SCENE_ID_APP', ''),
    };

    if (
      accessKeyId &&
      accessKeySecret &&
      this.prefix &&
      this.sceneIds.web &&
      this.sceneIds.app
    ) {
      const openApiConfig = new $OpenApi.Config({
        accessKeyId,
        accessKeySecret,
        endpoint: CAPTCHA_ENDPOINT,
        connectTimeout: CAPTCHA_TIMEOUT_MS,
        readTimeout: CAPTCHA_TIMEOUT_MS,
      });
      this.client = new Captcha20230305(openApiConfig);
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  getPublicConfig(): CaptchaPublicConfig {
    return {
      enabled: this.enabled,
      prefix: this.prefix,
      region: CAPTCHA_REGION,
      scene_ids: { ...this.sceneIds },
    };
  }

  /**
   * Verify a captcha token issued by the Aliyun Captcha 2.0 frontend SDK.
   * The captchaVerifyParam must be forwarded exactly as produced by the client.
   *
   * Fails open (passed: true, code: 'ERROR') on transient failures - timeouts,
   * connection resets, DNS problems, Aliyun 5xx - following Aliyun's
   * recommendation that the captcha service must not become a single point of
   * failure.
   *
   * Fails CLOSED (passed: false, code: 'CREDENTIAL_ERROR') on credential,
   * signature and permission failures: those are permanent misconfigurations
   * (rotated AccessKey, missing RAM policy) and failing open there would
   * silently switch the captcha off, which is exactly the state an attacker
   * would try to induce.
   */
  async verify(
    captchaVerifyParam: string,
    scene: CaptchaScene,
  ): Promise<CaptchaVerifyResult> {
    if (!this.client) {
      return { passed: true, code: 'DISABLED' };
    }

    const request = new $Captcha20230305.VerifyIntelligentCaptchaRequest({
      sceneId: this.sceneIds[scene],
      captchaVerifyParam,
    });

    try {
      const response = await this.client.verifyIntelligentCaptcha(request);
      const result = response.body?.result;
      const passed = result?.verifyResult === true;
      return { passed, code: result?.verifyCode ?? response.body?.code };
    } catch (error) {
      if (CaptchaService.isCredentialError(error)) {
        this.logger.error(
          'SERVER MISCONFIGURATION: Aliyun rejected the captcha credentials ' +
            `(code=${CaptchaService.errorCode(error)}, ` +
            `statusCode=${CaptchaService.errorStatusCode(error)}). ` +
            'Failing CLOSED: every captcha - and therefore every OTP send - ' +
            'will be rejected for ALL users until OBB_CAPTCHA_ACCESS_KEY_ID / ' +
            'OBB_CAPTCHA_ACCESS_KEY_SECRET and the RAM policy granting ' +
            'captcha:VerifyIntelligentCaptcha are fixed. This is not a user ' +
            'error.',
          error,
        );
        return { passed: false, code: 'CREDENTIAL_ERROR' };
      }
      this.logger.error('Captcha verify error, failing open:', error);
      return { passed: true, code: 'ERROR' };
    }
  }

  private static errorCode(error: unknown): string {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : 'unknown';
  }

  private static errorStatusCode(error: unknown): string {
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
    return typeof statusCode === 'number' ? String(statusCode) : 'unknown';
  }

  /**
   * Classify a thrown SDK error as a credential/permission/signature failure.
   * The error code is authoritative; a 401/403 status counts as well. A 404 is
   * deliberately NOT treated as credential-related by status alone (it can be a
   * transient routing problem) - only 'InvalidAccessKeyId.NotFound' and friends
   * are, via their code.
   */
  static isCredentialError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) {
      const normalized = code.toLowerCase();
      const matchesFamily = CREDENTIAL_ERROR_CODE_FAMILIES.some(
        (family) =>
          normalized === family ||
          normalized.startsWith(`${family}.`) ||
          normalized.endsWith(`.${family}`) ||
          normalized.includes(`.${family}.`),
      );
      if (matchesFamily) {
        return true;
      }
    }

    const statusCode = (error as { statusCode?: unknown }).statusCode;
    return (
      typeof statusCode === 'number' &&
      CREDENTIAL_ERROR_STATUS_CODES.includes(statusCode)
    );
  }
}
