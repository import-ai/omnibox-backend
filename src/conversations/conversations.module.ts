import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from 'src/conversations/entities/conversation.entity';
import { ConversationsService } from 'src/conversations/conversations.service';
import { ConversationsController } from 'src/conversations/conversations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation])],
  providers: [ConversationsService],
  controllers: [ConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
