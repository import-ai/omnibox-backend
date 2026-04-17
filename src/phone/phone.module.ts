import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsModule } from 'omniboxd/sms/sms.module';
import { PhoneConfigService } from './phone-config.service';
import { PhoneConfigController } from './phone-config.controller';

@Module({
  imports: [ConfigModule, SmsModule],
  controllers: [PhoneConfigController],
  providers: [PhoneConfigService],
  exports: [PhoneConfigService],
})
export class PhoneModule {}
