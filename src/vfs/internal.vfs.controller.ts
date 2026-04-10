import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { VFSService } from 'omniboxd/vfs/vfs.service';
import { Public } from 'omniboxd/auth';
import { VFSFilterResourcesRequestDto } from 'omniboxd/vfs/dto/filter.request.dto';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';

@Controller('internal/api/v1/namespaces/:namespaceId/vfs')
export class InternalVFSController {
  constructor(private readonly vfsService: VFSService) {}

  @Public()
  @Get('list')
  async listChildrenByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query('path') path: string,
  ) {
    return await this.vfsService.listChildrenByPath(namespaceId, userId, path);
  }

  @Public()
  @Get()
  async getContentByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query('path') path: string,
  ) {
    return await this.vfsService.getContentByPath(namespaceId, userId, path);
  }

  @Public()
  @Put()
  @HttpCode(HttpStatus.CREATED)
  async createByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body('path') path: string,
    @Body('content') content: string,
  ) {
    return await this.vfsService.createByPath(
      namespaceId,
      userId,
      path,
      content,
    );
  }

  @Public()
  @Delete()
  async deleteByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query('path') path: string,
  ) {
    return await this.vfsService.deleteByPath(namespaceId, userId, path);
  }

  @Public()
  @Patch('rename')
  async renameByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body('path') path: string,
    @Body('new_name') newName: string,
  ) {
    return await this.vfsService.renameByPath(
      namespaceId,
      userId,
      path,
      newName,
    );
  }

  @Public()
  @Patch('move')
  async moveByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body('path') path: string,
    @Body('new_parent_path') newParentPath: string,
  ) {
    return await this.vfsService.moveByPath(
      namespaceId,
      userId,
      path,
      newParentPath,
    );
  }

  @Public()
  @Get('filter')
  async resourceFilter(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query() requestDto: VFSFilterResourcesRequestDto,
  ) {
    return await this.vfsService.resourceFilter(
      namespaceId,
      userId,
      requestDto,
    );
  }

  @Public()
  @Get('path')
  async getPathByResourceId(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query('resource_id') resourceId: string,
    @Query('is_dir') isDir: boolean,
  ) {
    return await this.vfsService.getPathByResourceId(
      namespaceId,
      userId,
      resourceId,
      isDir,
    );
  }
}
