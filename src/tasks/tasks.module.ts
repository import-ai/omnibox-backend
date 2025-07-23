import { Module } from '@nestjs/common';
import { Task } from 'omnibox-backend/tasks/tasks.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from 'omnibox-backend/tasks/tasks.service';
import { TasksController } from 'omnibox-backend/tasks/tasks.controller';
import { NamespacesModule } from 'omnibox-backend/namespaces/namespaces.module';

@Module({
  providers: [TasksService],
  imports: [NamespacesModule, TypeOrmModule.forFeature([Task])],
  controllers: [TasksController],
})
export class TasksModule {}
