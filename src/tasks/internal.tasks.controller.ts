import { Task } from 'src/tasks/tasks.entity';
import { TasksService } from 'src/tasks/tasks.service';
import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from 'src/auth/decorators/public.decorator';
import { TaskCallbackDto } from './dto/task-callback.dto';

@Controller('internal/api/v1/tasks')
export class InternalTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Public()
  @Post('/callback')
  async handleTaskCallback(@Body() taskCallback: TaskCallbackDto): Promise<Record<string, any>> {
    return await this.tasksService.taskDoneCallback(taskCallback);
  }

  @Public()
  @Get('/fetch')
  async fetchTask(@Res() res: Response) {
    const task = await this.tasksService.fetch();
    res.status(task ? 200 : 204).json(task);
    return ;
  }
}
