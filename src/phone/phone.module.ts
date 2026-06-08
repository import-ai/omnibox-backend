import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsModule } from 'omniboxd/sms/sms.module';

import { PhoneConfigController } from './phone-config.controller';
import { PhoneConfigService } from './phone-config.service';

@Module({
  imports: [ConfigModule, SmsModule],
  controllers: [PhoneConfigController],
  providers: [PhoneConfigService],
  exports: [PhoneConfigService],
})
export class PhoneModule {}
