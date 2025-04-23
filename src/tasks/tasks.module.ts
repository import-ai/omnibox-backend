import { Module } from '@nestjs/common';
import { Task } from 'src/tasks/tasks.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from 'src/tasks/tasks.service';
import { TasksController } from 'src/tasks/tasks.controller';
import { InternalTasksController } from 'src/tasks/internal-tasks.controller';
import { NamespacesModule } from 'src/namespaces/namespaces.module';
import { ResourcesModule } from 'src/resources/resources.module';

@Module({
  providers: [TasksService],
  imports: [NamespacesModule, TypeOrmModule.forFeature([Task]), ResourcesModule],
  controllers: [TasksController, InternalTasksController],
})
export class TasksModule {}
