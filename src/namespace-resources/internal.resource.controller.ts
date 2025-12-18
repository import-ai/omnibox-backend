import { Controller, Get, Param, Query } from '@nestjs/common';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

@Controller('internal/api/v1')
export class InternalResourcesController {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
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
  ) {
    const ids = resourceIds ? resourceIds.split(',').filter((id) => id) : [];
    const tags = tag ? tag.split(',').filter((t) => t.trim()) : [];
    return await this.namespaceResourcesService.getResourcesForInternal(
      namespaceId,
      ids,
      createdAtBefore,
      createdAtAfter,
      userId,
      parentId,
      tags,
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
}
