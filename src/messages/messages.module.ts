import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from 'omniboxd/messages/entities/message.entity';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { MessagesController } from 'omniboxd/messages/messages.controller';
import { Task } from 'omniboxd/tasks/tasks.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Task])],
  providers: [MessagesService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
