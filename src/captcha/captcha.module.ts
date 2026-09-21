import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CaptchaGuard } from './captcha.guard';
import { CaptchaService } from './captcha.service';
import { CaptchaConfigController } from './captcha-config.controller';

@Module({
  imports: [ConfigModule],
  controllers: [CaptchaConfigController],
  providers: [CaptchaService, CaptchaGuard],
  exports: [CaptchaService, CaptchaGuard],
})
export class CaptchaModule {}
