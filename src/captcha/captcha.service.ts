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
   * Fails open (passed: true, code: 'ERROR') when the Aliyun API is
   * unreachable or throws, following Aliyun's recommendation that the
   * captcha service must not become a single point of failure.
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
      this.logger.error('Captcha verify error, failing open:', error);
      return { passed: true, code: 'ERROR' };
    }
  }
}
