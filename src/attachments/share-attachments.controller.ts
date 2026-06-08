import { Controller, Get, Param, Res, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { CookieAuth } from 'omniboxd/auth/decorators';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { Share } from 'omniboxd/shares/entities/share.entity';

import { AttachmentsService } from './attachments.service';

@Controller('api/v1/shares/:shareId/resources/:resourceId/attachments')
@UseInterceptors(ValidateShareInterceptor)
export class ShareAttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  @Get(':attachmentId')
  async downloadAttachment(
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
    @ValidatedShare() share: Share,
    @Res() res: Response,
  ) {
    return await this.attachmentsService.downloadAttachmentViaShare(
      share,
      resourceId,
      attachmentId,
      res,
    );
  }
}
