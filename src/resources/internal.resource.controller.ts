import { Response } from 'express';
import { fileResponse } from 'src/resources/utils';
import { Controller, Get, Param, Res } from '@nestjs/common';
import { ResourcesService } from 'src/resources/resources.service';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('internal/api/v1/resources')
export class InternalResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Public()
  @Get('files/:id')
  async downloadFile(@Param('id') resourceId: string, @Res() res: Response) {
    return await fileResponse(resourceId, res, this.resourcesService);
  }
}
