import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';

import {
  CAPTCHA_BODY_KEY,
  CLIENT_PLATFORM_HEADER,
  REQUIRE_CAPTCHA_KEY,
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
