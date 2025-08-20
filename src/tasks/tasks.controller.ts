import { Task } from 'omniboxd/tasks/tasks.entity';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

@Controller('api/v1/namespaces/:namespaceId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async createTask(@Body() data: Partial<Task>) {
    return await this.tasksService.create(data);
  }

  @Get()
  async listTasks(
    @Param('namespaceId') namespaceId: string,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 10,
  ) {
    return await this.tasksService.list(namespaceId, offset, limit);
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

  @Patch(':id/cancel')
  async cancelTask(@Param('id') id: string) {
    return await this.tasksService.cancelTask(id);
  }

  @Post(':id/rerun')
  async rerunTask(@Param('id') id: string) {
    return await this.tasksService.rerunTask(id);
  }
}
