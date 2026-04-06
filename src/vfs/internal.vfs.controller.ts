import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { VFSService } from 'omniboxd/vfs/vfs.service';
import { Public } from 'omniboxd/auth';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

@Controller('internal/api/v1/namespaces/:namespaceId/vfs')
export class InternalVFSController {
  constructor(private readonly vfsService: VFSService) {}

  @Public()
  @Get('list')
  async listChildrenByPath(
    @Param('namespaceId') namespaceId: string,
    @Query('user_id') userId: string,
    @Query('path') resourcePath?: string,
  ) {
    if (!userId) {
      throw new AppException(
        'user_id required',
        'INVALID_USER_ID',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const path = resourcePath ? `/${resourcePath}` : '/';
    return this.vfsService.listChildrenByPath(namespaceId, userId, path);
  }
}
