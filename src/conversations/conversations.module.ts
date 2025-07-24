import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from 'omnibox-backend/conversations/entities/conversation.entity';
import { ConversationsService } from 'omnibox-backend/conversations/conversations.service';
import { ConversationsController } from 'omnibox-backend/conversations/conversations.controller';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [MessagesModule, TypeOrmModule.forFeature([Conversation])],
  providers: [ConversationsService],
  controllers: [ConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
