import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from 'omnibox-backend/messages/entities/message.entity';
import { MessagesService } from 'omnibox-backend/messages/messages.service';
import { MessagesController } from 'omnibox-backend/messages/messages.controller';
import { Task } from 'omnibox-backend/tasks/tasks.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Task])],
  providers: [MessagesService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
