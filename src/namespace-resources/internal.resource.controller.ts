import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { FilesService } from 'omniboxd/files/files.service';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import { ResourceFilterRequestDto } from 'omniboxd/resources/dto/resource-filter.request.dto';
import { ResourcesService } from 'omniboxd/resources/resources.service';

@Controller('internal/api/v1')
export class InternalResourcesController {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
    private readonly filesService: FilesService,
  ) {}

  @Public()
  @Get('namespaces/:namespaceId/resources/:resourceId/file')
  async getResourceFile(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.namespaceResourcesService.getResourceFileForInternal(
      namespaceId,
      resourceId,
    );
  }

  @Public()
  @Get('namespaces/:namespaceId/resources/:resourceId/children')
  async getResourceChildren(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Query('depth') depth: number = 1,
  ) {
    return await this.namespaceResourcesService.getResourceChildrenForInternal(
      namespaceId,
      resourceId,
      depth,
    );
  }

  @Public()
  @Get('namespaces/:namespaceId/resources/filter')
  async filterResources(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query() requestDto: ResourceFilterRequestDto,
    @Query('parent_id') parentId?: string,
  ) {
    const resources = parentId
      ? await this.namespaceResourcesService.getAllSubResourcesByUser(
          userId,
          namespaceId,
          parentId,
        )
      : await this.namespaceResourcesService.getAllResourcesByUser(
          userId,
          namespaceId,
        );
    const resourceIds = resources.map((resource) => resource.id);
    return await this.namespaceResourcesService.resourceFilter(
      namespaceId,
      resourceIds,
      requestDto.options,
    );
  }

  @Public()
  @Get('namespaces/:namespaceId/resources/:resourceId')
  async getResource(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @HeaderUserId() userId: string,
  ) {
    return await this.namespaceResourcesService.getResource({
      userId,
      namespaceId,
      resourceId,
    });
  }

  @Public()
  @Get('namespaces/:namespaceId/resources/:resourceId/list')
  async listResourceChildren(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @HeaderUserId() userId: string,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 20,
  ) {
    return await this.namespaceResourcesService.listChildrenWithTotal(
      namespaceId,
      resourceId,
      userId,
      { offset, limit },
    );
  }

  @Public()
  @Post('namespaces/:namespaceId/resources')
  @HttpCode(HttpStatus.CREATED)
  @CheckNamespaceReadonly()
  async createResource(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body() createDto: CreateResourceDto,
  ) {
    const resource = await this.namespaceResourcesService.create(
      userId,
      namespaceId,
      createDto,
    );
    const [dto] =
      await this.namespaceResourcesService.BatchResourceToInternalResourceDto(
        namespaceId,
        [resource],
      );
    return dto;
  }

  @Public()
  @Delete('namespaces/:namespaceId/resources/:resourceId')
  @CheckNamespaceReadonly()
  async deleteResource(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @HeaderUserId() userId: string,
    @Query('recursive') recursive?: string,
  ) {
    const [dto] =
      await this.namespaceResourcesService.batchGetResourceInternalDto(
        namespaceId,
        userId,
        [resourceId],
      );
    if (!dto) {
      throw new AppException(
        'Resource not found',
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    const isRecursive = recursive === 'true' || recursive === '1';
    const hasChildren = await this.namespaceResourcesService.hasChildren(
      userId,
      namespaceId,
      resourceId,
    );
    if (hasChildren && !isRecursive) {
      throw new AppException(
        'Resource has children and cannot be deleted',
        'RESOURCE_HAS_CHILDREN',
        HttpStatus.CONFLICT,
      );
    }
    await this.namespaceResourcesService.delete(
      userId,
      namespaceId,
      resourceId,
    );
    return dto;
  }

  @Public()
  @Post('resources/recalculate-content-sizes')
  async recalculateContentSizes(
    @Query('namespaceId') namespaceId?: string,
    @Query('batchSize') batchSize: number = 100,
  ) {
    const result = await this.resourcesService.recalculateContentSizes(
      namespaceId,
      batchSize,
    );
    return result;
  }

  @Public()
  @Post('attachments/recalculate-sizes')
  async recalculateAttachmentSizes(
    @Query('namespaceId') namespaceId?: string,
    @Query('batchSize') batchSize: number = 100,
  ) {
    const result =
      await this.resourceAttachmentsService.recalculateAttachmentSizes(
        namespaceId,
        batchSize,
      );
    return result;
  }

  @Public()
  @Post('files/recalculate-sizes')
  async recalculateFileSizes(
    @Query('namespaceId') namespaceId?: string,
    @Query('batchSize') batchSize: number = 100,
  ) {
    const result = await this.filesService.recalculateFileSizes(
      namespaceId,
      batchSize,
    );
    return result;
  }

  @Public()
  @Patch('namespaces/:namespaceId/resources/:resourceId')
  async patchResource(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @HeaderUserId() userId: string,
    @Body() updateDto: UpdateResourceDto,
  ) {
    return await this.namespaceResourcesService.update(
      namespaceId,
      userId,
      resourceId,
      updateDto,
    );
  }
}
