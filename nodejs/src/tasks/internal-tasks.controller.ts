import { Controller, Post, Get, Body } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { Task } from './tasks.entity';

@Controller('internal/api/v1/tasks')
export class InternalTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('/callback')
  async handleTaskCallback(@Body() taskData: Partial<Task>) {
    await this.tasksService.handleTaskCallback(taskData);
    return { detail: 'Task callback processed' };
  }

  @Get('/fetch')
  async fetchTask(): Promise<Task | null> {
    return this.tasksService.fetchTask();
  }
}
