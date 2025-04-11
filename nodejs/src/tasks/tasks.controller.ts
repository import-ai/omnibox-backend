import { Controller, Post, Get, Delete, Body, Query, Param } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { Task } from './tasks.entity';

@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async createTask(@Body() data: Partial<Task>) {
    return this.tasksService.createTask(data);
  }

  @Get()
  async listTasks(
    @Query('namespaceId') namespaceId: string,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 10,
  ) {
    return this.tasksService.listTasks(namespaceId, offset, limit);
  }

  @Get('/:taskId')
  async getTaskById(@Param('taskId') taskId: string) {
    return this.tasksService.getTaskById(taskId);
  }

  @Delete('/:taskId')
  async deleteTask(@Param('taskId') taskId: string) {
    await this.tasksService.deleteTask(taskId);
    return { detail: 'Task deleted' };
  }
}
