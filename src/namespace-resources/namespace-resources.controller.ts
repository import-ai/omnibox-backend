import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18n, I18nContext } from 'nestjs-i18n';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { ChildrenMetaDto } from './dto/list-children-resp.dto';

@Controller('api/v1/namespaces/:namespaceId/resources')
export class NamespaceResourcesController {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  async findById(
    @UserId() userId: string,
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
    const resources = await this.namespaceResourcesService.findByIds(
      namespaceId,
      userId,
      ids,
    );
    return Promise.all(
      resources.map((resource) =>
        this.namespaceResourcesService
          .hasChildren(userId, namespaceId, resource.id)
          .then((hasChildren) =>
            Promise.resolve({
              ...resource,
              hasChildren,
            }),
          ),
      ),
    );
  }

  @Post()
  async create(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() data: CreateResourceDto,
  ) {
    const newResource = await this.namespaceResourcesService.create(
      userId,
      namespaceId,
      data,
    );
    return await this.namespaceResourcesService.getResource({
      namespaceId,
      resourceId: newResource.id,
      userId,
    });
  }

  @Post(':resourceId/duplicate')
  async duplicate(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const newResource = await this.namespaceResourcesService.duplicate(
      userId,
      namespaceId,
      resourceId,
    );
    return await this.namespaceResourcesService.getResource({
      namespaceId,
      userId,
      resourceId: newResource.id,
    });
  }

  @Get('query')
  async query(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Query('parentId') parentId: string,
    @Query('tags') tags: string,
  ) {
    return await this.namespaceResourcesService.query(
      namespaceId,
      parentId,
      userId,
      tags,
    );
  }

  @Get(':resourceId/children')
  async listChildren(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<ChildrenMetaDto[]> {
    return this.namespaceResourcesService.listChildren(
      namespaceId,
      resourceId,
      userId,
    );
  }

  @Post(':resourceId/move/:targetId')
  async move(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('targetId') targetId: string,
  ) {
    return await this.namespaceResourcesService.move(
      namespaceId,
      resourceId,
      userId,
      targetId,
    );
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

  @Get('recent')
  async recent(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Query('limit') limit?: string,
  ): Promise<ResourceMetaDto[]> {
    const take = Number.isFinite(Number(limit)) ? Number(limit) : 10;
    return await this.namespaceResourcesService.recent(
      namespaceId,
      userId,
      take,
    );
  }

  @Get(':resourceId')
  async get(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.namespaceResourcesService.getResource({
      namespaceId,
      resourceId,
      userId,
    });
  }

  @Get(':resourceId/file')
  async getResourceFile(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.namespaceResourcesService.getResourceFile(
      userId,
      namespaceId,
      resourceId,
    );
  }

  @Patch(':resourceId')
  async update(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() data: UpdateResourceDto,
    @I18n() i18n: I18nContext,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!hasPermission) {
      const message = i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    await this.namespaceResourcesService.update(userId, resourceId, data);
    return await this.namespaceResourcesService.getResource({
      namespaceId,
      resourceId,
      userId,
    });
  }

  @Delete(':resourceId')
  async delete(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @I18n() i18n: I18nContext,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!hasPermission) {
      const message = i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    return await this.namespaceResourcesService.delete(
      userId,
      namespaceId,
      resourceId,
    );
  }

  @Post(':resourceId/restore')
  async restore(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    await this.namespaceResourcesService.restore(userId, resourceId);
    const resource = await this.namespaceResourcesService.getResource({
      namespaceId,
      resourceId,
      userId,
    });
    const hasChildren = await this.namespaceResourcesService.hasChildren(
      userId,
      namespaceId,
      resourceId,
    );
    return {
      ...resource,
      hasChildren,
    };
  }
}
