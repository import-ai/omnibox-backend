import { Controller, Get, Param } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import {
  InternalResourceTaskDto,
  InternalTaskDto,
} from 'omniboxd/tasks/dto/task.dto';
import { TasksService } from 'omniboxd/tasks/tasks.service';

@Controller('internal/api/v1/wizard/tasks')
export class InternalWizardTasksController {
  constructor(private readonly tasksService: TasksService) {}

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
