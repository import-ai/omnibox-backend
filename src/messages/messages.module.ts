import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from 'src/messages/entities/message.entity';
import { MessagesService } from 'src/messages/messages.service';
import { MessagesController } from 'src/messages/messages.controller';
import { Task } from 'src/tasks/tasks.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Task])],
  providers: [MessagesService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
