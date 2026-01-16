import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { PhoneConfigService } from './phone-config.service';
import { SmsService } from 'omniboxd/sms/sms.service';

@ApiTags('Phone')
@Controller('api/v1/phone')
export class PhoneConfigController {
  constructor(
    private readonly phoneConfigService: PhoneConfigService,
    private readonly smsService: SmsService,
  ) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Get phone configuration' })
  getConfig() {
    const smsStatus = this.smsService.available();
    return {
      allowed_countries: this.phoneConfigService.getAllowedCountries(),
      sms_available: smsStatus.available,
    };
  }
}
