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
    return await this.resourcesService.get(resourceId);
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
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    return await this.resourcesService.delete(req.user, resourceId);
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
