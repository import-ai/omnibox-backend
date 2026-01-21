import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { Request, Response } from 'express';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { UploadAttachmentsResponseDto } from './dto/upload-attachments-response.dto';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { CheckStorageQuota } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';

@Controller('api/v1/namespaces/:namespaceId/resources/:resourceId/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @CheckStorageQuota()
  @UseInterceptors(FilesInterceptor('file[]'))
  async uploadAttachments(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadAttachmentsResponseDto> {
    return await this.attachmentsService.uploadAttachments(
      namespaceId,
      resourceId,
      userId,
      files,
    );
  }

  @Get(':attachmentId')
  @CookieAuth({ onAuthFail: 'continue' })
  async downloadAttachment(
    @Req() req: Request,
    @UserId({ optional: true }) userId: string | undefined,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    if (!userId) {
      this.setRedirect(req, res);
      return;
    }
    return await this.attachmentsService.downloadAttachment(
      namespaceId,
      resourceId,
      attachmentId,
      userId,
      res,
    );
  }

  setRedirect(req: Request, res: Response) {
    res
      .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      .status(HttpStatus.FOUND)
      .redirect(`/user/login?redirect=${encodeURIComponent(req.url)}`);
  }

  @Delete(':attachmentId')
  async deleteAttachment(
    @UserId() userId: string,
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
