import { TasksService } from 'omniboxd/tasks/tasks.service';
import { Controller, Get, Param } from '@nestjs/common';
import { InternalTaskDto } from 'omniboxd/tasks/dto/task.dto';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

@Controller('internal/api/v1/wizard/tasks')
export class InternalWizardTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Public()
  @Get(':id')
  async getTaskById(@Param('id') id: string) {
    return InternalTaskDto.fromEntity(await this.tasksService.get(id));
  }
}
