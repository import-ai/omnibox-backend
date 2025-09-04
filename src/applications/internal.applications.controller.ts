import { ApplicationsService } from './applications.service';
import { Body, Controller, Param, Post } from '@nestjs/common';

@Controller('internal/api/v1/applications')
export class InternalApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post(':appId')
  async callback(
    @Param('appId') appId: string,
    @Body() data: Record<string, any>,
  ): Promise<any> {
    return await this.applicationsService.callback(appId, data);
  }
}
