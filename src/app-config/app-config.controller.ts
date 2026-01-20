import { Controller, Get } from '@nestjs/common';

export interface AppConfigResponse {
  commercial: boolean;
}

@Controller('api/v1/config')
export class AppConfigController {
  @Get()
  getAppConfig(): AppConfigResponse {
    return {
      commercial: false,
    };
  }
}
