import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import {
  InternalResourceTaskDto,
  InternalTaskDto,
} from 'omniboxd/tasks/dto/task.dto';
import { TasksService } from 'omniboxd/tasks/tasks.service';

class TaskQuotaCheckDto {
  @IsObject()
  task: Record<string, unknown>;
  @IsObject()
  quota: Record<string, unknown>;
}

@Controller('internal/api/v1/wizard/tasks')
export class InternalWizardTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Public()
  @Post(':id/check')
  async checkTask(@Param('id') id: string, @Body() request: TaskQuotaCheckDto) {
    return this.tasksService.checkTaskQuota(id, request);
  }

  @Public()
  @Get(':id')
  async getTaskById(@Param('id') id: string) {
    return InternalTaskDto.fromEntity(await this.tasksService.get(id));
  }
}

@Controller(
  'internal/api/v1/namespaces/:namespaceId/resources/:resourceId/tasks',
)
export class InternalResourceTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Public()
  @Get()
  async getResourceTasks(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<InternalResourceTaskDto[]> {
    const tasks = await this.tasksService.getTasksByResourceId(
      namespaceId,
      resourceId,
    );
    return tasks.map((task) => InternalResourceTaskDto.fromTaskMeta(task));
  }
}
