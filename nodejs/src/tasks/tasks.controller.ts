import { Task } from 'src/tasks/tasks.entity';
import { TasksService } from 'src/tasks/tasks.service';
import {
  Post,
  Get,
  Body,
  Query,
  Param,
  Delete,
  Controller,
} from '@nestjs/common';

@Controller('api/v1/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async createTask(@Body() data: Partial<Task>) {
    return await this.tasksService.create(data);
  }

  @Get()
  async listTasks(
    @Query('namespaceId') namespaceId: string,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 10,
  ) {
    return await this.tasksService.list(namespaceId, offset, limit);
  }

  @Get(':taskId')
  async getTaskById(@Param('taskId') taskId: string) {
    return await this.tasksService.get(taskId);
  }

  @Delete(':taskId')
  async deleteTask(@Param('taskId') taskId: string) {
    await this.tasksService.delete(taskId);
    return { detail: 'Task deleted' };
  }
}
