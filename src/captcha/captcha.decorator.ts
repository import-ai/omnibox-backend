import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { REQUIRE_CAPTCHA_KEY } from './captcha.constants';
import { CaptchaGuard } from './captcha.guard';

/**
 * Require Aliyun Captcha 2.0 verification before the handler runs.
 * The client must send `captcha_verify_param` in the JSON body; the scene
 * is chosen from the `x-client-platform` header ('web' -> web, else app).
 */
export const RequireCaptcha = () =>
  applyDecorators(
    SetMetadata(REQUIRE_CAPTCHA_KEY, true),
    UseGuards(CaptchaGuard),
  );
