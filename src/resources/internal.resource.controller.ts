import { Response } from 'express';
import { Controller, Get, Param, Res } from '@nestjs/common';
import { ResourcesService } from 'omnibox-backend/resources/resources.service';
import { Public } from 'omnibox-backend/auth/decorators/public.decorator';

@Controller('internal/api/v1/resources')
export class InternalResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Public()
  @Get('files/:id')
  async downloadFile(@Param('id') resourceId: string, @Res() res: Response) {
    return await this.resourcesService.fileResponse(resourceId, res);
  }
}
