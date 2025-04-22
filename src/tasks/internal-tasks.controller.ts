import { Task } from 'src/tasks/tasks.entity';
import { TasksService } from 'src/tasks/tasks.service';
import { Controller, Post, Get, Body } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('internal/api/v1/tasks')
export class InternalTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('/callback')
  async handleTaskCallback(@Body() taskData: Partial<Task>) {
    await this.tasksService.handleCallback(taskData);
    return { detail: 'Task callback processed' };
  }

  @Public()
  @Get('/fetch')
  async fetchTask(): Promise<Task | null> {
    return await this.tasksService.fetch();
  }
}
