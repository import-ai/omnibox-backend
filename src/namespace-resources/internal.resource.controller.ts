import { Response } from 'express';
import { Controller, Get, Param, Res } from '@nestjs/common';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

@Controller('internal/api/v1')
export class InternalResourcesController {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
  ) {}

  @Public()
  @Get('resources/files/:id')
  async downloadFile(@Param('id') resourceId: string, @Res() res: Response) {
    return await this.namespaceResourcesService.fileResponse(resourceId, res);
  }

  @Public()
  @Get('namespaces/:namespaceId/resources/:resourceId/file')
  async getResourceFile(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.namespaceResourcesService.getResourceFileForInternal(
      namespaceId,
      resourceId,
    );
  }
}
