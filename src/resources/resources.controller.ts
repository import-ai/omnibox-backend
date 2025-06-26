import { Resource } from 'src/resources/resources.entity';
import { ResourcesService } from 'src/resources/resources.service';
import { CreateResourceDto } from 'src/resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'src/resources/dto/update-resource.dto';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { SpaceType } from 'src/namespaces/entities/namespace.entity';
import { PermissionsService } from 'src/permissions/permissions.service';
import { PermissionLevel } from 'src/permissions/permission-level.enum';

export async function fileResponse(
  resourceId: string,
  response: Response,
  resourcesService: ResourcesService,
) {
  const { fileStream, resource } =
    await resourcesService.downloadFile(resourceId);
  const encodedName = encodeURIComponent(resource.name);
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodedName}"`,
  );
  response.setHeader(
    'Content-Type',
    resource.attrs?.mimetype || 'application/octet-stream',
  );
  fileStream.pipe(response);
}

@Controller('api/v1/namespaces/:namespaceId/resources')
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Post()
  async create(@Req() req, @Body() data: CreateResourceDto) {
    return await this.resourcesService.create(req.user, data);
  }

  @Post('duplicate/:resourceId')
  async duplicate(@Req() req, @Param('resourceId') resourceId: string) {
    return await this.resourcesService.duplicate(req.user, resourceId);
  }

  @Get('query')
  async query(
    @Req() req,
    @Query('namespace') namespaceId: string,
    @Query('spaceType') spaceType: SpaceType,
    @Query('parentId') parentId: string,
    @Query('tags') tags: string,
  ) {
    return await this.resourcesService.query({
      namespaceId,
      spaceType,
      parentId,
      userId: req.user.id,
      tags,
    });
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

  @Get(':resourceId/search')
  async search(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Query('name') name: string,
  ) {
    return await this.resourcesService.search({
      namespaceId,
      resourceId,
      name,
      userId: req.user.id,
    });
  }

  @Get(':resourceId/path')
  async path(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const resources: Array<Resource> = [];
    let currentResource = await this.resourcesService.get(resourceId);
    while (currentResource && currentResource.parentId) {
      resources.push(currentResource);
      currentResource = await this.resourcesService.get(
        currentResource.parentId,
      );
    }
    return await this.resourcesService.permissionFilter(
      namespaceId,
      req.user.id,
      resources,
    );
  }

  @Get(':resourceId')
  async get(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user.id,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    const currentLevel = await this.permissionsService.getCurrentLevel(
      namespaceId,
      resourceId,
      req.user.id,
    );
    const resource = await this.resourcesService.get(resourceId);
    return { ...resource, currentLevel };
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
      PermissionLevel.CAN_EDIT,
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
      PermissionLevel.CAN_EDIT,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    return await this.resourcesService.delete(req.user, resourceId);
  }

  @Post(':resourceId/restore')
  async restore(@Req() req, @Param('resourceId') resourceId: string) {
    return await this.resourcesService.restore(req.user, resourceId);
  }

  @Post('files')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('namespace_id') namespaceId: string,
    @Body('parent_id') parentId: string,
  ) {
    return this.resourcesService.uploadFile(
      req.user,
      namespaceId,
      file,
      parentId,
      undefined,
    );
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
    return this.resourcesService.mergeFileChunks(
      req.user,
      namespaceId,
      totalChunks,
      fileHash,
      fileName,
      mimetype,
      parentId,
    );
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
