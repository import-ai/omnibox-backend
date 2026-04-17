import { Controller, Get, Param, Query } from '@nestjs/common';
import { NamespaceTasksService } from './namespace-tasks.service';

@Controller('api/v1/namespaces/:namespaceId/tasks')
export class NamespaceTasksController {
  constructor(private readonly namespaceTasksService: NamespaceTasksService) {}

  @Get()
  async listTasks(
    @Param('namespaceId') namespaceId: string,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 10,
    @Query('userId') userId?: string,
  ) {
    return await this.namespaceTasksService.list(
      namespaceId,
      offset,
      limit,
      userId,
    );
  }
}
