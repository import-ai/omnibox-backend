import { Controller, Get } from '@nestjs/common';
import { Public } from 'omniboxd/auth';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';

export interface AppConfigResponse {
  commercial: boolean;
}

@Controller('api/v1/config')
export class AppConfigController {
  constructor(private readonly wizardApi: WizardAPIService) {}

  @Public()
  @Get('models')
  getModelsConfig() {
    return this.wizardApi.getModelsConfig();
  }

  @Get()
  getAppConfig(): AppConfigResponse {
    return {
      commercial: false,
    };
  }
}
