import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { ConversationsController } from 'omniboxd/conversations/conversations.controller';
import { MessagesModule } from '../messages/messages.module';
import { UserModule } from '../user/user.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';

@Module({
  imports: [
    MessagesModule,
    UserModule,
    TasksModule,
    TypeOrmModule.forFeature([Conversation]),
  ],
  providers: [ConversationsService],
  controllers: [ConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
