import { Controller, Get, Param, Post, Query, Body } from '@nestjs/common';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import { FilesService } from 'omniboxd/files/files.service';
import { FilterResourcesDto } from 'omniboxd/namespace-resources/dto/filter-resources.dto';

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
  @Get('namespaces/:namespaceId/resources')
  async getResources(
    @Param('namespaceId') namespaceId: string,
    @Query('id') resourceIds?: string,
    @Query('createdAtBefore') createdAtBefore?: Date,
    @Query('createdAtAfter') createdAtAfter?: Date,
    @Query('userId') userId?: string,
    @Query('parentId') parentId?: string,
    @Query('tag') tag?: string,
    @Query('nameContains') nameContains?: string,
    @Query('contentContains') contentContains?: string,
  ) {
    const ids = resourceIds
      ? resourceIds.split(',').filter((id) => id)
      : undefined;
    const tags = tag ? tag.split(',').filter((t) => t.trim()) : undefined;
    return await this.namespaceResourcesService.getResourcesForInternal(
      namespaceId,
      ids,
      createdAtBefore,
      createdAtAfter,
      userId,
      parentId,
      tags,
      nameContains,
      contentContains,
    );
  }

  @Public()
  @Post('namespaces/:namespaceId/resources/query')
  async filterResources(
    @Param('namespaceId') namespaceId: string,
    @Body() filterDto: FilterResourcesDto,
  ) {
    return await this.namespaceResourcesService.getResourcesForInternal(
      namespaceId,
      filterDto.ids,
      filterDto.createdAtBefore,
      filterDto.createdAtAfter,
      filterDto.userId,
      filterDto.parentId,
      filterDto.tags,
      filterDto.nameContains,
      filterDto.contentContains,
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
}
