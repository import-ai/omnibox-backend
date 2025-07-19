import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from 'src/resources/attachments/attachments.service';
import { Response } from 'express';
import { UserId } from 'src/auth/decorators/user-id.decorator';

@Controller('api/v1/namespaces/:namespaceId/resources/:resourceId/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('file[]'))
  async uploadAttachments(
    @UserId() userId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
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
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
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
