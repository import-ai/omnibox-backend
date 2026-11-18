import { Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { TaskDto } from 'omniboxd/tasks/dto/task.dto';
import { TasksService } from 'omniboxd/tasks/tasks.service';

@Controller('api/v1/namespaces/:namespaceId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get(':id')
  async getTaskById(@Param('id') id: string) {
    return TaskDto.fromEntity(await this.tasksService.get(id));
  }

  @Delete(':id')
  async deleteTask(@Param('id') id: string) {
    await this.tasksService.delete(id);
    return { detail: 'Task deleted' };
  }

  @Patch(':id/cancel')
  async cancelTask(@Param('id') id: string) {
    return await this.tasksService.cancelTaskOrFail(id);
  }
}

@Controller('api/v1/namespaces/:namespaceId/resources/:resourceId/tasks')
export class ResourceTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async getResourceTasks(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.tasksService.getTasksByResourceId(
      namespaceId,
      resourceId,
    );
  }
}
