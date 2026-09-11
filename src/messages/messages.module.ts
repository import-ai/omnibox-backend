import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationAttachment } from 'omniboxd/attachments/entities/conversation-attachment.entity';
import { MessageAttachment } from 'omniboxd/attachments/entities/message-attachment.entity';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { Message } from 'omniboxd/messages/entities/message.entity';
import { MessagesController } from 'omniboxd/messages/messages.controller';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TasksModule } from 'omniboxd/tasks/tasks.module';

import { NamespacesModule } from '../namespaces/namespaces.module';

@Module({
  imports: [
    TasksModule,
    NamespacesModule,
    TypeOrmModule.forFeature([
      Conversation,
      ConversationAttachment,
      Message,
      MessageAttachment,
      Task,
    ]),
  ],
  providers: [MessagesService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
