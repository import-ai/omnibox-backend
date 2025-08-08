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
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { Request, Response } from 'express';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { Cookies } from 'omniboxd/decorators/cookie.decorators';
import { AuthService } from 'omniboxd/auth/auth.service';

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
      const payload = this.authService.jwtVerify(token);
      if (payload && payload.sub) {
        userId = payload.sub;
      }
    }

    this.logger.debug({ userId, token, cookies: req.cookies });
    if (userId) {
      return await this.attachmentsService.displayImage(
        attachmentId,
        userId,
        res,
      );
    }
    res
      .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      .status(HttpStatus.FOUND)
      .redirect(`/user/login?redirect=${encodeURIComponent(req.url)}`);
  }

  @Public()
  @Get('media/:attachmentId')
  async displayMedia(
    @Req() req: Request,
    @Res() res: Response,
    @Cookies('token') token: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    let userId = '';

    if (token) {
      const payload = this.authService.jwtVerify(token);
      if (payload && payload.sub) {
        userId = payload.sub;
      }
    }

    if (userId) {
      return await this.attachmentsService.displayMedia(
        attachmentId,
        userId,
        res,
      );
    }
    res
      .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      .status(HttpStatus.FOUND)
      .redirect(`/user/login?redirect=${encodeURIComponent(req.url)}`);
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
