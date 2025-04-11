import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { InternalTasksController } from './internal-tasks.controller';
import { Task } from './tasks.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Task])],
  providers: [TasksService],
  controllers: [TasksController, InternalTasksController],
})
export class TasksModule {}
