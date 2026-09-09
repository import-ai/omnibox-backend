import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from 'omniboxd/auth';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { Share } from 'omniboxd/shares/entities/share.entity';

import { AttachmentsService } from './attachments.service';

@Public()
@ValidateShare()
@Controller('internal/api/v1/shares/:shareId/resources/:resourceId/attachments')
@UseInterceptors(ValidateShareInterceptor)
export class InternalShareAttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get()
  async listAttachments(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
    @ValidatedShare() share: Share,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return await this.attachmentsService.listAttachmentsViaShare(
      share,
      resourceId,
      (attachmentId) =>
        `/api/v1/shares/${shareId}/resources/${resourceId}/attachments/${attachmentId}`,
      offset ?? 0,
      limit ?? 20,
    );
  }

  @Get(':attachmentId/llm-url')
  async getAttachmentLlmUrl(
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
    @ValidatedShare() share: Share,
  ) {
    return await this.attachmentsService.getResourceAttachmentLlmUrlViaShare(
      share,
      resourceId,
      attachmentId,
    );
  }

  @Get(':attachmentId/metadata')
  async getAttachmentInfo(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
    @ValidatedShare() share: Share,
  ) {
    return await this.attachmentsService.getAttachmentInfoViaShare(
      share,
      resourceId,
      attachmentId,
      `/api/v1/shares/${shareId}/resources/${resourceId}/attachments/${attachmentId}`,
    );
  }

  @Get(':attachmentId')
  async downloadAttachment(
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
    @ValidatedShare() share: Share,
    @Res() response: Response,
  ) {
    return await this.attachmentsService.downloadAttachmentViaShare(
      share,
      resourceId,
      attachmentId,
      response,
    );
  }
}
