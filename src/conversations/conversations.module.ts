import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { ConversationsController } from 'omniboxd/conversations/conversations.controller';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [MessagesModule, TypeOrmModule.forFeature([Conversation])],
  providers: [ConversationsService],
  controllers: [ConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
