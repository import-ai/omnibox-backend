import { Module } from '@nestjs/common';
import { AppConfigController } from 'omniboxd/app-config/app-config.controller';
import { WizardAPIModule } from 'omniboxd/wizard-api/wizard-api.module';

@Module({
  imports: [WizardAPIModule],
  controllers: [AppConfigController],
})
export class AppConfigModule {}
