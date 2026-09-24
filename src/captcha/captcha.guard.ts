import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { supportsClientFeature } from 'omniboxd/utils/client-features';

import {
  CAPTCHA_BODY_KEY,
  CLIENT_PLATFORM_HEADER,
  CLIENT_VERSION_HEADER,
  REQUIRE_CAPTCHA_KEY,
  UPGRADE_REQUIRED_STATUS,
} from './captcha.constants';
import { CaptchaScene, CaptchaService } from './captcha.service';

@Injectable()
export class CaptchaGuard implements CanActivate {
  private readonly logger = new Logger(CaptchaGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly captchaService: CaptchaService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_CAPTCHA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || !this.captchaService.enabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const param = request.body?.[CAPTCHA_BODY_KEY];
    if (typeof param !== 'string' || param.length === 0) {
      // Released apps predating captcha cannot send the param: tell them to
      // update instead of demanding a captcha they have no way to produce.
      // Only applies when the param is absent - a client that sends one is
      // always verified normally, whatever version the native binary reports.
      const platform = request.headers[CLIENT_PLATFORM_HEADER];
      const isMobileApp = platform === 'android' || platform === 'ios';
      if (isMobileApp && !supportsClientFeature(request.headers, 'captcha')) {
        this.logger.warn(
          `Captcha unsupported by client (platform=${platform}, version=${String(
            request.headers[CLIENT_VERSION_HEADER] ?? 'unknown',
          )})`,
        );
        throw new HttpException(
          this.i18n.t('captcha.errors.upgradeRequired'),
          UPGRADE_REQUIRED_STATUS,
        );
      }
      throw new BadRequestException(this.i18n.t('captcha.errors.required'));
    }

    const scene = CaptchaGuard.resolveScene(request);
    const result = await this.captchaService.verify(param, scene);
    if (!result.passed) {
      this.logger.warn(
        `Captcha verification failed (scene=${scene}, code=${result.code})`,
      );
      throw new ForbiddenException(this.i18n.t('captcha.errors.failed'));
    }
    return true;
  }

  static resolveScene(request: Request): CaptchaScene {
    return request.headers[CLIENT_PLATFORM_HEADER] === 'web' ? 'web' : 'app';
  }
}
