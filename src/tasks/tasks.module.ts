import { Module } from '@nestjs/common';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { TasksController } from 'omniboxd/tasks/tasks.controller';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';

@Module({
  providers: [TasksService, WizardTaskService],
  imports: [TypeOrmModule.forFeature([Task])],
  controllers: [TasksController],
  exports: [TasksService, WizardTaskService],
})
export class TasksModule {}
