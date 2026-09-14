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
import { Response } from 'express';
import { Public } from 'omniboxd/auth';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';

import { AttachmentsService } from './attachments.service';
import { ConversationAttachmentsService } from './conversation-attachments.service';

@Public()
@Controller(
  'internal/api/v1/namespaces/:namespaceId/resources/:resourceId/attachments',
)
export class InternalAttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get()
  async listAttachments(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return await this.attachmentsService.listAttachments(
      namespaceId,
      resourceId,
      userId,
      (attachmentId) =>
        `/api/v1/namespaces/${namespaceId}/resources/${resourceId}/attachments/${attachmentId}`,
      offset ?? 0,
      limit ?? 20,
    );
  }

  @Post()
  @CheckNamespaceReadonly()
  @UseInterceptors(FilesInterceptor('file[]'))
  async uploadAttachments(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return await this.attachmentsService.uploadAttachments(
      namespaceId,
      resourceId,
      userId,
      files,
    );
  }

  @Get(':attachmentId')
  async downloadAttachment(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    return await this.attachmentsService.downloadAttachment(
      namespaceId,
      resourceId,
      attachmentId,
      userId,
      response,
    );
  }

  @Get(':attachmentId/llm-url')
  async getAttachmentLlmUrl(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return await this.attachmentsService.getResourceAttachmentLlmUrl(
      namespaceId,
      resourceId,
      attachmentId,
      userId,
    );
  }

  @Get(':attachmentId/metadata')
  async getAttachmentInfo(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return await this.attachmentsService.getAttachmentInfo(
      namespaceId,
      resourceId,
      attachmentId,
      userId,
      `/api/v1/namespaces/${namespaceId}/resources/${resourceId}/attachments/${attachmentId}`,
    );
  }

  @Delete(':attachmentId')
  async deleteAttachment(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return await this.attachmentsService.deleteAttachment(
      namespaceId,
      resourceId,
      attachmentId,
      userId,
    );
  }
}

@Public()
@Controller(
  'internal/api/v1/namespaces/:namespaceId/conversations/:conversationId/attachments',
)
export class InternalConversationAttachmentsController {
  constructor(
    private readonly attachmentsService: ConversationAttachmentsService,
  ) {}

  @Get(':attachmentId/llm-url')
  async getAttachmentLlmUrl(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('conversationId') conversationId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return await this.attachmentsService.getConversationAttachmentLlmUrl(
      namespaceId,
      conversationId,
      attachmentId,
      userId,
    );
  }

  @Get(':attachmentId')
  async downloadAttachment(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('conversationId') conversationId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    return await this.attachmentsService.downloadConversationAttachment(
      namespaceId,
      conversationId,
      attachmentId,
      userId,
      response,
    );
  }

  @Post(':attachmentId/promote')
  @CheckNamespaceReadonly()
  async promote(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('conversationId') conversationId: string,
    @Param('attachmentId') attachmentId: string,
    @Query('resource_id') resourceId: string,
  ) {
    return await this.attachmentsService.promoteConversationAttachment(
      namespaceId,
      conversationId,
      attachmentId,
      resourceId,
      userId,
    );
  }
}
