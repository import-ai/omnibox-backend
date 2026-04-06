import { Controller, Get, Param, Query } from '@nestjs/common';
import { VFSService } from 'omniboxd/vfs/vfs.service';
import { Public } from 'omniboxd/auth';

@Controller('internal/api/v1/vfs')
export class InternalVFSController {
  constructor(private readonly vfsService: VFSService) {}

  @Public()
  @Get('list/:namespaceId/**')
  async listChildrenByPath(
    @Param('namespaceId') namespaceId: string,
    @Query() userId: string,
    @Param('0') resourcePath: string,
  ) {
    return this.vfsService.listChildrenByPath(
      namespaceId,
      resourcePath,
      userId,
    );
  }
}
