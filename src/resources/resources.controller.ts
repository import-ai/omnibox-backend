import { Response } from 'express';
import { fileResponse } from './utils';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResourcesService } from 'omnibox-backend/resources/resources.service';
import { CreateResourceDto } from 'omnibox-backend/resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'omnibox-backend/resources/dto/update-resource.dto';
import { PermissionsService } from 'omnibox-backend/permissions/permissions.service';
import { ResourcePermission } from 'omnibox-backend/permissions/resource-permission.enum';
import {
  Req,
  Res,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  Delete,
  Controller,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';

@Controller('api/v1/namespaces/:namespaceId/resources')
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  async findById(
    @Param('namespaceId') namespaceId: string,
    @Query('id') id: string,
  ) {
    if (!id) {
      return [];
    }
    const ids = id.split(',');
    if (ids.length <= 0) {
      return [];
    }
    return await this.resourcesService.findByIds(namespaceId, ids);
  }

  @Post()
  async create(@Req() req, @Body() data: CreateResourceDto) {
    return await this.resourcesService.create(req.user, data);
  }

  @Post('duplicate/:resourceId')
  async duplicate(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const newResource = await this.resourcesService.duplicate(
      req.user,
      resourceId,
    );
    const { resource, permission, path } = await this.resourcesService.getPath({
      namespaceId,
      userId: req.user.id,
      resourceId: newResource.id,
    });
    return { ...resource, currentLevel: permission, path };
  }

  @Get('query')
  async query(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Query('parentId') parentId: string,
    @Query('tags') tags: string,
  ) {
    return await this.resourcesService.query(
      namespaceId,
      parentId,
      req.user.id,
      tags,
    );
  }

  @Get(':resourceId/children')
  async listChildren(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.resourcesService.listChildren(
      namespaceId,
      resourceId,
      req.user.id,
    );
  }

  @Post(':resourceId/move/:targetId')
  async move(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('targetId') targetId: string,
  ) {
    return await this.resourcesService.move({
      userId: req.user.id,
      namespaceId,
      resourceId,
      targetId,
    });
  }

  @Get('search')
  async search(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Query('resourceId') resourceId: string,
    @Query('name') name: string,
  ) {
    return await this.resourcesService.search({
      namespaceId,
      resourceId,
      name,
      userId: req.user.id,
    });
  }

  @Get(':resourceId')
  async get(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const { resource, permission, path } = await this.resourcesService.getPath({
      namespaceId,
      resourceId,
      userId: req.user.id,
    });
    return { ...resource, currentLevel: permission, path };
  }

  @Patch(':resourceId')
  async update(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() data: UpdateResourceDto,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user.id,
      ResourcePermission.CAN_EDIT,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    return await this.resourcesService.update(req.user, resourceId, data);
  }

  @Delete(':resourceId')
  async delete(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user.id,
      ResourcePermission.CAN_EDIT,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    return await this.resourcesService.delete(req.user, resourceId);
  }

  @Post(':resourceId/restore')
  async restore(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    await this.resourcesService.restore(req.user, resourceId);
    const { resource, permission, path } = await this.resourcesService.getPath({
      namespaceId,
      resourceId,
      userId: req.user.id,
    });
    return { ...resource, currentLevel: permission, path };
  }

  @Post('files')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('namespace_id') namespaceId: string,
    @Body('parent_id') parentId: string,
  ) {
    const newResource = await this.resourcesService.uploadFile(
      req.user,
      namespaceId,
      file,
      parentId,
      undefined,
    );
    const { resource, permission, path } = await this.resourcesService.getPath({
      namespaceId,
      userId: req.user.id,
      resourceId: newResource.id,
    });
    return { ...resource, currentLevel: permission, path };
  }

  @Post('files/chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  async uploadFileChunk(
    @UploadedFile() chunk: Express.Multer.File,
    @Body('chunk_number') chunkNumber: string,
    @Body('file_hash') fileHash: string,
    @Body('namespace_id') namespaceId: string,
  ) {
    return this.resourcesService.uploadFileChunk(
      namespaceId,
      chunk,
      chunkNumber,
      fileHash,
    );
  }

  @Post('files/chunk/clean')
  async cleanFileChunks(
    @Body('namespace_id') namespaceId: string,
    @Body('chunks_number') chunksNumber: string,
    @Body('file_hash') fileHash: string,
  ) {
    return this.resourcesService.cleanFileChunks(
      namespaceId,
      chunksNumber,
      fileHash,
    );
  }

  @Post('files/merge')
  async mergeFileChunks(
    @Req() req,
    @Body('namespace_id') namespaceId: string,
    @Body('total_chunks', ParseIntPipe) totalChunks: number,
    @Body('file_hash') fileHash: string,
    @Body('file_name') fileName: string,
    @Body('mimetype') mimetype: string,
    @Body('parent_id') parentId: string,
  ) {
    const newResource = await this.resourcesService.mergeFileChunks(
      req.user,
      namespaceId,
      totalChunks,
      fileHash,
      fileName,
      mimetype,
      parentId,
    );
    const { resource, permission, path } = await this.resourcesService.getPath({
      namespaceId,
      userId: req.user.id,
      resourceId: newResource.id,
    });
    return { ...resource, currentLevel: permission, path };
  }

  @Patch('files/:resourceId')
  @UseInterceptors(FileInterceptor('file'))
  async patchFile(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('namespace_id') namespaceId: string,
    @Body('resource_id') resourceId: string,
  ) {
    return this.resourcesService.uploadFile(
      req.user,
      namespaceId,
      file,
      undefined,
      resourceId,
    );
  }

  @Get('files/:resourceId')
  async downloadFile(
    @Param('resourceId') resourceId: string,
    @Res() res: Response,
  ) {
    return await fileResponse(resourceId, res, this.resourcesService);
  }
}
