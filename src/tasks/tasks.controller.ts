import { Task } from 'src/tasks/tasks.entity';
import { TasksService } from 'src/tasks/tasks.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CollectRequestDto } from 'src/tasks/dto/collect-request.dto';

@Controller('api/v1/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async createTask(@Body() data: Partial<Task>) {
    return await this.tasksService.create(data);
  }

  @Post('collect')
  async collect(@Req() req, @Body() data: CollectRequestDto) {
    return await this.tasksService.collect(req.user, data);
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
