import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from 'omnibox-backend/attachments/attachments.service';
import { Request, Response } from 'express';
import { UserId } from 'omnibox-backend/auth/decorators/user-id.decorator';
import { Public } from 'omnibox-backend/auth/decorators/public.decorator';
import { Cookies } from 'omnibox-backend/decorators/cookie.decorators';
import { AuthService } from 'omnibox-backend/auth/auth.service';

@Controller('api/v1/attachments')
export class AttachmentsController {
  private readonly logger = new Logger(AttachmentsController.name);

  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseInterceptors(FilesInterceptor('file[]'))
  async uploadAttachments(
    @UserId() userId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Query('namespaceId') namespaceId: string,
    @Query('resourceId') resourceId: string,
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
    @UserId() userId: string,
    @Res() res: Response,
    @Query('namespaceId') namespaceId: string,
    @Query('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return await this.attachmentsService.downloadAttachment(
      namespaceId,
      resourceId,
      attachmentId,
      userId,
      res,
    );
  }

  @Public()
  @Get('images/:attachmentId')
  async displayImage(
    @Req() req: Request,
    @Res() res: Response,
    @Cookies('token') token: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    let userId = '';

    if (token) {
      try {
        const payload = this.authService.jwtVerify(token);
        userId = payload.sub;
      } catch {
        /* empty */
      }
    }
    this.logger.debug({ userId, token, cookies: req.cookies });
    if (userId) {
      return await this.attachmentsService.displayImage(
        attachmentId,
        userId,
        res,
      );
    } else {
      res
        .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        .status(HttpStatus.FOUND)
        .redirect(`/user/login?redirect=${encodeURIComponent(req.url)}`);
    }
  }

  @Delete(':attachmentId')
  async deleteAttachment(
    @UserId() userId: string,
    @Query('namespaceId') namespaceId: string,
    @Query('resourceId') resourceId: string,
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
