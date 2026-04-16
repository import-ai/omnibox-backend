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
import { VfsService } from 'omniboxd/vfs/vfs.service';
import { Public } from 'omniboxd/auth';
import { VFSFilterResourcesRequestDto } from 'omniboxd/vfs/dto/filter.request.dto';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { CreateRequestDto } from 'omniboxd/vfs/dto/create.request.dto';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { MkdirRequestDto } from 'omniboxd/vfs/dto/mkdir.request.dto';

@Controller('internal/api/v1/namespaces/:namespaceId/vfs')
export class InternalVfsController {
  constructor(private readonly vfsService: VfsService) {}

  @Public()
  @Get('list')
  async listChildrenByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query('path') path: string,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 20,
  ) {
    return await this.vfsService.listChildrenByPath(
      namespaceId,
      userId,
      path,
      offset,
      limit,
    );
  }

  @Public()
  @Get('content')
  async getContentByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query('path') path: string,
  ) {
    return await this.vfsService.getContentByPath(namespaceId, userId, path);
  }

  @Public()
  @Get()
  async getVfsResourceByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query('path') path: string,
  ) {
    return await this.vfsService.getVfsResourceByPath(
      namespaceId,
      userId,
      path,
    );
  }

  @Public()
  @Put()
  @HttpCode(HttpStatus.CREATED)
  @CheckNamespaceReadonly()
  async createByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body() requestDto: CreateRequestDto,
  ) {
    return await this.vfsService.createByPath(
      namespaceId,
      userId,
      requestDto.path,
      requestDto.content,
    );
  }

  @Public()
  @Delete()
  @CheckNamespaceReadonly()
  async deleteByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body('path') path: string,
    @Body('recursive') recursive?: boolean,
  ) {
    return await this.vfsService.deleteByPath(
      namespaceId,
      userId,
      path,
      recursive,
    );
  }

  @Public()
  @Patch('rename')
  @CheckNamespaceReadonly()
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
  @CheckNamespaceReadonly()
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
  ) {
    return await this.vfsService.getPathByResourceId(
      namespaceId,
      userId,
      resourceId,
    );
  }

  @Public()
  @Put('mkdir')
  @HttpCode(HttpStatus.CREATED)
  @CheckNamespaceReadonly()
  async createFolderByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body() dto: MkdirRequestDto,
  ) {
    return await this.vfsService.createFolderByPath(
      namespaceId,
      userId,
      dto.path,
      dto.createParents,
    );
  }
}
