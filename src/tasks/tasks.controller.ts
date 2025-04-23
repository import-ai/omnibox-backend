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
  ParseIntPipe,
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
    @Query('namespace', ParseIntPipe) namespace: number,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 10,
  ) {
    return await this.tasksService.list(namespace, offset, limit);
  }

  @Get(':id')
  async getTaskById(@Param('id', ParseIntPipe) id: number) {
    return await this.tasksService.get(id);
  }

  @Delete(':id')
  async deleteTask(@Param('id', ParseIntPipe) id: number) {
    await this.tasksService.delete(id);
    return { detail: 'Task deleted' };
  }
}
