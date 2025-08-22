import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { Cookies } from 'omniboxd/decorators/cookie.decorators';

@Controller('api/v1/shares/:shareId/resources/:resourceId/attachments')
export class ShareAttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @Get(':attachmentId')
  async downloadAttachment(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
    @Cookies('share-password') password: string,
    @Res() res: Response,
    @UserId({ optional: true }) userId?: string,
  ) {
    return await this.attachmentsService.downloadAttachmentViaShare(
      shareId,
      resourceId,
      attachmentId,
      password,
      userId,
      res,
    );
  }
}
