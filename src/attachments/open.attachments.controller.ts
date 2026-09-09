import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import {
  APIKey as APIKeyEntity,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { OpenResourcesService } from 'omniboxd/namespace-resources/open-resources.service';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { SkipOpenAPIQuota } from 'omniboxd/open-api/open-api-quota.decorator';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

import { AttachmentsService } from './attachments.service';
import { ListAttachmentsResponseDto } from './dto/attachment-response.dto';
import { UploadAttachmentsResponseDto } from './dto/upload-attachments-response.dto';

@ApiTags('Resource Attachments')
@ApiSecurity('api-key')
@Controller('open/api/v1/resources/:resourceId/attachments')
export class OpenAttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly openResourcesService: OpenResourcesService,
  ) {}

  @Get()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.READ],
      },
    ],
  })
  @ApiOperation({ summary: 'List resource attachments' })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: ListAttachmentsResponseDto })
  async listAttachments(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<ListAttachmentsResponseDto> {
    await this.openResourcesService.resolveResourceId(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      resourceId,
      userId,
    );
    return await this.attachmentsService.listAttachments(
      apiKey.namespaceId,
      resourceId,
      userId,
      (attachmentId) =>
        `/open/api/v1/resources/${resourceId}/attachments/${attachmentId}`,
      offset ?? 0,
      limit ?? 20,
    );
  }

  @Post()
  @SkipOpenAPIQuota()
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.UPDATE],
      },
    ],
  })
  @UseInterceptors(FilesInterceptor('file[]'))
  @ApiOperation({ summary: 'Upload resource attachments' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file[]'],
      properties: {
        'file[]': {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({ status: 201, type: UploadAttachmentsResponseDto })
  async uploadAttachments(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadAttachmentsResponseDto> {
    await this.openResourcesService.resolveResourceId(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    return await this.attachmentsService.uploadAttachments(
      apiKey.namespaceId,
      resourceId,
      userId,
      files,
    );
  }

  @Get(':attachmentId')
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.READ],
      },
    ],
  })
  @ApiOperation({ summary: 'Download a resource attachment' })
  @ApiResponse({ status: 200, description: 'Attachment content' })
  async downloadAttachment(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    await this.openResourcesService.resolveResourceId(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      resourceId,
      userId,
    );
    return await this.attachmentsService.downloadAttachment(
      apiKey.namespaceId,
      resourceId,
      attachmentId,
      userId,
      response,
    );
  }

  @Delete(':attachmentId')
  @SkipOpenAPIQuota()
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.UPDATE],
      },
    ],
  })
  @ApiOperation({ summary: 'Delete a resource attachment' })
  @ApiResponse({ status: 200, description: 'Attachment deleted' })
  async deleteAttachment(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    await this.openResourcesService.resolveResourceId(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    return await this.attachmentsService.deleteAttachment(
      apiKey.namespaceId,
      resourceId,
      attachmentId,
      userId,
    );
  }
}
