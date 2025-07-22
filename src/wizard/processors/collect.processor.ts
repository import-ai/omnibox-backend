import { ResourcesService } from 'omnibox-backend/resources/resources.service';
import { Task } from 'omnibox-backend/tasks/tasks.entity';
import { BadRequestException } from '@nestjs/common';
import { Processor } from 'omnibox-backend/wizard/processors/processor.abstract';
import { UserService } from 'omnibox-backend/user/user.service';

export class CollectProcessor extends Processor {
  constructor(
    private readonly userService: UserService,
    private readonly resourcesService: ResourcesService,
  ) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    const resourceId = task.payload?.resource_id || task.payload?.resourceId;
    if (!resourceId) {
      throw new BadRequestException('Invalid task payload');
    }
    if (task.exception) {
      const user = await this.userService.find(task.userId);
      if (user) {
        await this.resourcesService.update(user, resourceId, {
          namespaceId: task.namespaceId,
          content: task.exception.error,
        });
      }
      return {};
    } else if (task.output) {
      const { markdown, title, ...attrs } = task.output || {};
      const resource = await this.resourcesService.get(resourceId);
      const mergedAttrs = { ...(resource?.attrs || {}), ...attrs };
      const user = await this.userService.find(task.userId);
      if (user) {
        await this.resourcesService.update(user, resourceId, {
          namespaceId: task.namespaceId,
          name: title,
          content: markdown,
          attrs: mergedAttrs,
        });
      }
      return { resourceId };
    }
    return {};
  }
}
