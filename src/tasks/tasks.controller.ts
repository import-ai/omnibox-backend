import { Task } from 'omnibox-backend/tasks/tasks.entity';
import { TasksService } from 'omnibox-backend/tasks/tasks.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
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
    @Query('namespace') namespace: string,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 10,
  ) {
    return await this.tasksService.list(namespace, offset, limit);
  }

  @Get(':id')
  async getTaskById(@Param('id') id: string) {
    return await this.tasksService.get(id);
  }

  @Delete(':id')
  async deleteTask(@Param('id') id: string) {
    await this.tasksService.delete(id);
    return { detail: 'Task deleted' };
  }
}
