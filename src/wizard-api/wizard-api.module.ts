import { Module } from '@nestjs/common';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';

@Module({
  providers: [WizardAPIService],
  exports: [WizardAPIService],
})
export class WizardAPIModule {}
