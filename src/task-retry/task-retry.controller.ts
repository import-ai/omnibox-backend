import { Controller, Param, Post } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { TaskRetryService } from 'omniboxd/task-retry/task-retry.service';

@Controller('api/v1/namespaces/:namespaceId/tasks')
export class TaskRerunController {
  constructor(private readonly taskRetryService: TaskRetryService) {}

  @Post(':id/rerun')
  async rerunTask(
    @Param('namespaceId') namespaceId: string,
    @Param('id') id: string,
    @UserId() userId: string,
  ) {
    return await this.taskRetryService.rerunOne(namespaceId, userId, id);
  }
}
