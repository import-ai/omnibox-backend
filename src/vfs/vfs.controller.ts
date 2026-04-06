import { Controller, Get, Param, Query } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { VFSService } from 'omniboxd/vfs/vfs.service';

@Controller('api/v1/namespaces/:namespaceId/vfs')
export class VFSController {
  constructor(private readonly vfsService: VFSService) {}
  @Get('list')
  async listChildrenByPath(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Query('path') resourcePath?: string,
  ) {
    const path = resourcePath ? `/${resourcePath}` : '/';
    return this.vfsService.listChildrenByPath(namespaceId, userId, path);
  }
}
