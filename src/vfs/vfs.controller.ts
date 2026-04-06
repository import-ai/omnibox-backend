import { Controller, Get, Param } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { VFSService } from 'omniboxd/vfs/vfs.service';

@Controller('api/v1/vfs')
export class VFSController {
  constructor(private readonly vfsService: VFSService) {}
  @Get('list/:namespaceId/**')
  async listChildrenByPath(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Param('0') resourcePath: string, // path captured by '**' is accessed via Param('0')
  ) {
    return this.vfsService.listChildrenByPath(
      namespaceId,
      resourcePath,
      userId,
    );
  }
}
