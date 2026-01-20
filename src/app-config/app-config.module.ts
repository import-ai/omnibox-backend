import { Module } from '@nestjs/common';
import { AppConfigController } from 'omniboxd/app-config/app-config.controller';

@Module({
  controllers: [AppConfigController],
})
export class AppConfigModule {}
