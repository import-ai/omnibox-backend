import {
  Controller,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  APIKey as APIKeyEntity,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { SkipOpenAPIQuota } from 'omniboxd/open-api/open-api-quota.decorator';

import { ConversationAttachmentsService } from './conversation-attachments.service';
import { UploadConversationAttachmentResponseDto } from './dto/upload-conversation-attachment-response.dto';

@ApiTags('Conversation Attachments')
@ApiSecurity('api-key')
@Controller('open/api/v1/conversations/:conversationId/attachments')
export class OpenConversationAttachmentsController {
  constructor(
    private readonly conversationAttachmentsService: ConversationAttachmentsService,
  ) {}

  @Post()
  @SkipOpenAPIQuota()
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.CHAT,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  @UseInterceptors(FilesInterceptor('file[]', 1))
  @ApiOperation({ summary: 'Upload a conversation attachment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file[]'],
      properties: {
        'file[]': {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    type: UploadConversationAttachmentResponseDto,
  })
  async upload(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('conversationId') conversationId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadConversationAttachmentResponseDto> {
    return await this.conversationAttachmentsService.uploadConversationAttachment(
      apiKey.namespaceId,
      conversationId,
      userId,
      files?.[0],
    );
  }
}
