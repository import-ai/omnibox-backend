import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';

import { COMMENT_IMAGE_MAX_SIZE } from './comment-image';
import { ResourceCommentAttachmentsService } from './resource-comment-attachments.service';

@Controller(
  'api/v1/namespaces/:namespaceId/resources/:resourceId/comment-attachments',
)
export class ResourceCommentAttachmentsController {
  constructor(
    private readonly attachmentsService: ResourceCommentAttachmentsService,
  ) {}

  @Post()
  @CheckNamespaceReadonly()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: COMMENT_IMAGE_MAX_SIZE } }),
  )
  async uploadAttachment(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.attachmentsService.uploadAttachment(
      namespaceId,
      resourceId,
      userId,
      file,
    );
  }

  @Get(':attachmentId')
  async downloadAttachment(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    return await this.attachmentsService.downloadAttachment(
      namespaceId,
      resourceId,
      attachmentId,
      userId,
      res,
    );
  }
}
