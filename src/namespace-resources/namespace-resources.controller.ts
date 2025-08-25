import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
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
} from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { Request } from 'express';
import { ResourceMetaDto } from 'omniboxd/namespace-resources/dto/resource.dto';

@Controller('api/v1/namespaces/:namespaceId/resources')
export class NamespaceResourcesController {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
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
    return await this.namespaceResourcesService.findByIds(namespaceId, ids);
  }

  @Post()
  async create(@UserId() userId: string, @Body() data: CreateResourceDto) {
    const newResource = await this.namespaceResourcesService.create(userId, data);
    return await this.namespaceResourcesService.getPath({
      namespaceId: data.namespaceId,
      resourceId: newResource.id,
      userId: userId,
    });
  }

  @Post(':resourceId/duplicate')
  async duplicate(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const newResource = await this.namespaceResourcesService.duplicate(
      req.user!.id,
      resourceId,
    );
    return await this.namespaceResourcesService.getPath({
      namespaceId,
      userId: req.user!.id,
      resourceId: newResource.id,
    });
  }

  @Get('query')
  async query(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Query('parentId') parentId: string,
    @Query('tags') tags: string,
  ) {
    return await this.namespaceResourcesService.query(
      namespaceId,
      parentId,
      req.user!.id,
      tags,
    );
  }

  @Get(':resourceId/children')
  async listChildren(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<ResourceMetaDto[]> {
    return this.namespaceResourcesService.listChildren(namespaceId, resourceId, userId);
  }

  @Post(':resourceId/move/:targetId')
  async move(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('targetId') targetId: string,
  ) {
    return await this.namespaceResourcesService.move({
      userId: req.user!.id,
      namespaceId,
      resourceId,
      targetId,
    });
  }

  @Get('search')
  async search(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Query('exclude_resource_id') excludeResourceId: string | undefined,
    @Query('name') name: string | undefined,
  ): Promise<ResourceMetaDto[]> {
    return await this.namespaceResourcesService.search({
      namespaceId,
      excludeResourceId,
      name,
      userId,
    });
  }

  @Get(':resourceId')
  async get(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.namespaceResourcesService.getPath({
      namespaceId,
      resourceId,
      userId: req.user!.id,
    });
  }

  @Patch(':resourceId')
  async update(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() data: UpdateResourceDto,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user!.id,
      ResourcePermission.CAN_EDIT,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    await this.namespaceResourcesService.update(req.user!.id, resourceId, data);
    return await this.namespaceResourcesService.getPath({
      namespaceId,
      resourceId,
      userId: req.user!.id,
    });
  }

  @Delete(':resourceId')
  async delete(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user!.id,
      ResourcePermission.CAN_EDIT,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    return await this.namespaceResourcesService.delete(req.user!.id, resourceId);
  }

  @Post(':resourceId/restore')
  async restore(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    await this.namespaceResourcesService.restore(req.user!.id, resourceId);
    return await this.namespaceResourcesService.getPath({
      namespaceId,
      resourceId,
      userId: req.user!.id,
    });
  }
}
