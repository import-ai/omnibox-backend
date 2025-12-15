import { Injectable } from '@nestjs/common';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TaskMetaDto } from 'omniboxd/tasks/dto/task.dto';
import { TasksService } from 'omniboxd/tasks/tasks.service';

@Injectable()
export class NamespaceTasksService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly resourcesService: ResourcesService,
  ) {}

  async list(
    namespaceId: string,
    offset: number,
    limit: number,
    userId?: string,
  ): Promise<{ tasks: TaskMetaDto[]; total: number }> {
    const { tasks, total } = await this.tasksService.list(
      namespaceId,
      offset,
      limit,
      userId,
    );

    const resourceIds = [
      ...new Set(
        tasks
          .map((task) => task.resource_id)
          .filter((id): id is string => !!id),
      ),
    ];

    const resources = await this.resourcesService.batchGetResourceMeta(
      namespaceId,
      resourceIds,
    );

    for (const task of tasks) {
      const resource = task.resource_id
        ? resources.get(task.resource_id)
        : undefined;
      if (resource) {
        task.canCancel =
          (task.status === 'pending' || task.status === 'running') &&
          task.function !== 'delete_index';
        task.canRerun = task.status === 'canceled';
        task.canRedirect = true;
      } else {
        task.canCancel = false;
        task.canRerun = false;
        task.canRedirect = false;
      }
    }

    return { tasks, total };
  }
}
