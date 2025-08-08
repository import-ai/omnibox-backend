import { ResourcesService } from 'omniboxd/resources/resources.service';
import { CreateResourceDto } from 'omniboxd/resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'omniboxd/resources/dto/update-resource.dto';
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
  async create(@UserId() userId: string, @Body() data: CreateResourceDto) {
    return await this.resourcesService.create(userId, data);
  }

  @Post(':resourceId/duplicate')
  async duplicate(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const newResource = await this.resourcesService.duplicate(
      req.user!.id,
      resourceId,
    );
    return await this.resourcesService.getPath({
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
    return await this.resourcesService.query(
      namespaceId,
      parentId,
      req.user!.id,
      tags,
    );
  }

  @Get(':resourceId/children')
  async listChildren(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.resourcesService.listChildren(
      namespaceId,
      resourceId,
      req.user!.id,
    );
  }

  @Post(':resourceId/move/:targetId')
  async move(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('targetId') targetId: string,
  ) {
    return await this.resourcesService.move({
      userId: req.user!.id,
      namespaceId,
      resourceId,
      targetId,
    });
  }

  @Get('search')
  async search(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Query('resourceId') resourceId: string,
    @Query('name') name: string,
  ) {
    return await this.resourcesService.search({
      namespaceId,
      resourceId,
      name,
      userId: req.user!.id,
    });
  }

  @Get(':resourceId')
  async get(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.resourcesService.getPath({
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
    await this.resourcesService.update(req.user!.id, resourceId, data);
    return await this.resourcesService.getPath({
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
    return await this.resourcesService.delete(req.user!.id, resourceId);
  }

  @Post(':resourceId/restore')
  async restore(
    @Req() req: Request,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    await this.resourcesService.restore(req.user!.id, resourceId);
    return await this.resourcesService.getPath({
      namespaceId,
      resourceId,
      userId: req.user!.id,
    });
  }
}
