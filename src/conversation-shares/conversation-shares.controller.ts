import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { I18n, I18nContext } from 'nestjs-i18n';
import { Public } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

import { ConversationShareImagesService } from './conversation-share-images.service';
import { ConversationSharesService } from './conversation-shares.service';
import { CreateConversationShareDto } from './dto/create-conversation-share.dto';

@Controller('api/v1/namespaces/:namespaceId/conversation-shares')
export class ConversationSharesController {
  constructor(
    private readonly conversationSharesService: ConversationSharesService,
  ) {}

  @Post()
  async create(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() request: CreateConversationShareDto,
    @I18n() i18n: I18nContext,
  ) {
    return await this.conversationSharesService.create(
      namespaceId,
      userId,
      request,
      i18n.lang,
    );
  }
}

@Public()
@Controller('api/v1/conversation-shares')
export class PublicConversationSharesController {
  constructor(
    private readonly conversationSharesService: ConversationSharesService,
    private readonly images: ConversationShareImagesService,
  ) {}

  @Get(':shareId')
  async get(@Param('shareId') shareId: string) {
    return await this.conversationSharesService.getPublic(shareId);
  }

  @Get(':shareId/resource-images/:attachmentId')
  async getResourceImage(
    @Param('shareId') shareId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    await this.images.streamResourceImage(shareId, attachmentId, response);
  }

  @Get(':shareId/images/:attachmentId')
  async getImage(
    @Param('shareId') shareId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() response: Response,
  ) {
    await this.images.streamQuestionImage(shareId, attachmentId, response);
  }
}
