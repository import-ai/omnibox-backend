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
    return await this.vfsService.listChildrenByPath(namespaceId, userId, path);
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
    return await this.vfsService.getContentByPath(namespaceId, userId, path, {
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
    return await this.vfsService.createByPath(
      namespaceId,
      userId,
      path,
      content,
    );
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
    return await this.vfsService.overwriteByPath(
      namespaceId,
      userId,
      path,
      content,
    );
  }

  @Public()
  @Patch('replace')
  async replaceContentByPath(
    @Param('namespaceId') namespaceId: string,
    @Body('user_id') userId: string,
    @Body('path') resourcePath: string,
    @Body('old_string') oldString: string,
    @Body('new_string') newString: string,
    @Body('replace_all') replaceAll: boolean,
  ) {
    if (!userId) {
      throw new AppException(
        'user_id required',
        'INVALID_USER_ID',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const path = `/${resourcePath}`;
    return await this.vfsService.replaceContentByPath(
      namespaceId,
      userId,
      path,
      oldString,
      newString,
      replaceAll,
    );
  }
}
