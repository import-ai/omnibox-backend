import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsController } from 'omniboxd/conversations/conversations.controller';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { SharedConversationsController } from 'omniboxd/conversations/shared-conversations.controller';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { WizardAPIModule } from 'omniboxd/wizard-api/wizard-api.module';

import { MessagesModule } from '../messages/messages.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    WizardAPIModule,
    MessagesModule,
    UserModule,
    TasksModule,
    SharesModule,
    TypeOrmModule.forFeature([Conversation]),
  ],
  providers: [ConversationsService],
  controllers: [ConversationsController, SharedConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
