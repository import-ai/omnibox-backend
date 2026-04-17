import { Global, Module } from '@nestjs/common';
import { WIZARD_URL_PROVIDER } from 'omniboxd/wizard-url-provider/wizard-url-provider.interface';
import { WizardUrlProviderService } from 'omniboxd/wizard-url-provider/wizard-url-provider.service';

@Global()
@Module({
  providers: [
    {
      provide: WIZARD_URL_PROVIDER,
      useClass: WizardUrlProviderService,
    },
  ],
  exports: [WIZARD_URL_PROVIDER],
})
export class WizardUrlProviderModule {}
