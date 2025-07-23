import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from 'omnibox-backend/attachments/attachments.service';
import { Response } from 'express';
import { UserId } from 'omnibox-backend/auth/decorators/user-id.decorator';

@Controller('api/v1/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

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

  @Get('images/:attachmentId')
  async displayImage(
    @Res() res: Response,
    @Query('namespaceId') namespaceId: string,
    @Query('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const userId = '';
    return await this.attachmentsService.displayImage(
      namespaceId,
      resourceId,
      attachmentId,
      userId,
      res,
    );
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
