import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
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

  @Public()
  @Get()
  async getContentByPath(
    @Param('namespaceId') namespaceId: string,
    @Query('user_id') userId: string,
    @Query('path') resourcePath: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
  ) {
    if (!userId) {
      throw new AppException(
        'user_id required',
        'INVALID_USER_ID',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const path = `/${resourcePath}`;
    return this.vfsService.getContentByPath(namespaceId, userId, path, {
      offset,
      limit,
    });
  }

  @Public()
  @Put()
  async createByPath(
    @Param('namespaceId') namespaceId: string,
    @Body('user_id') userId: string,
    @Body('path') resourcePath: string,
    @Body('content') content: string,
  ) {
    if (!userId) {
      throw new AppException(
        'user_id required',
        'INVALID_USER_ID',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const path = `/${resourcePath}`;
    return this.vfsService.createByPath(namespaceId, userId, path, content);
  }

  @Public()
  @Patch()
  async overwriteByPath(
    @Param('namespaceId') namespaceId: string,
    @Body('user_id') userId: string,
    @Body('path') resourcePath: string,
    @Body('content') content: string,
  ) {
    if (!userId) {
      throw new AppException(
        'user_id required',
        'INVALID_USER_ID',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const path = `/${resourcePath}`;
    return this.vfsService.overwriteByPath(namespaceId, userId, path, content);
  }
}
