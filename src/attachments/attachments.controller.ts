import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';

import { ConversationAttachmentsService } from './conversation-attachments.service';
import { UploadAttachmentsResponseDto } from './dto/upload-attachments-response.dto';

@Controller('api/v1/namespaces/:namespaceId/resources/:resourceId/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get()
  async listAttachments(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return await this.attachmentsService.listAttachments(
      namespaceId,
      resourceId,
      userId,
      (attachmentId) =>
        `/api/v1/namespaces/${namespaceId}/resources/${resourceId}/attachments/${attachmentId}`,
      offset ?? 0,
      limit ?? 20,
    );
  }

  @Post()
  @CheckNamespaceReadonly()
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

@Controller(
  'api/v1/namespaces/:namespaceId/conversations/:conversationId/attachments',
)
export class ConversationAttachmentsController {
  constructor(
    private readonly attachmentsService: ConversationAttachmentsService,
  ) {}

  @Post()
  @UseInterceptors(FilesInterceptor('file[]', 1))
  async upload(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('conversationId') conversationId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return await this.attachmentsService.uploadConversationAttachment(
      namespaceId,
      conversationId,
      userId,
      files?.[0],
    );
  }

  @Get(':attachmentId')
  async download(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('conversationId') conversationId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    return await this.attachmentsService.downloadConversationAttachment(
      namespaceId,
      conversationId,
      attachmentId,
      userId,
      response,
    );
  }
}
