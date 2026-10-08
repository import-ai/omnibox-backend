import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

import { CaptchaService } from './captcha.service';

@ApiTags('Captcha')
@Controller('api/v1/captcha')
export class CaptchaConfigController {
  constructor(private readonly captchaService: CaptchaService) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Get Aliyun Captcha 2.0 public configuration' })
  getConfig() {
    return this.captchaService.getPublicConfig();
  }
}
