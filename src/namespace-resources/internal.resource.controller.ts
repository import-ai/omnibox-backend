import {
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Body,
} from '@nestjs/common';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import { FilesService } from 'omniboxd/files/files.service';
import type { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';

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
