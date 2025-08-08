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
import { AuthService } from 'omniboxd/auth/auth.service';
import { CookieAuth } from 'omniboxd/auth';

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

  setRedirect(req: Request, res: Response) {
    res
      .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      .status(HttpStatus.FOUND)
      .redirect(`/user/login?redirect=${encodeURIComponent(req.url)}`);
  }

  @CookieAuth({ onAuthFail: 'continue' })
  @Get('images/:attachmentId')
  async displayImage(
    @UserId({ optional: true }) userId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
    @Param('attachmentId') attachmentId: string,
  ) {
    if (userId) {
      return await this.attachmentsService.displayMedia(
        attachmentId,
        userId,
        res,
      );
    }
    this.setRedirect(req, res);
  }

  @CookieAuth({ onAuthFail: 'continue' })
  @Get('media/:attachmentId')
  async displayMedia(
    @UserId({ optional: true }) userId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
    @Param('attachmentId') attachmentId: string,
  ) {
    if (userId) {
      return await this.attachmentsService.displayMedia(
        attachmentId,
        userId,
        res,
      );
    }
    this.setRedirect(req, res);
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
