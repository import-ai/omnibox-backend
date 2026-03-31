import { Body, Controller, Param, Post } from '@nestjs/common';
import { Public } from 'omniboxd/auth';
import { ApplicationsService } from 'omniboxd/applications/applications.service';

@Controller('internal/api/v1/applications')
export class InternalApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Public()
  @Post(':appId/callback')
  async callback(
    @Param('appId') appId: string,
    @Body() data: Record<string, any>,
  ): Promise<any> {
    return await this.applicationsService.callback(appId, data);
  }
}
