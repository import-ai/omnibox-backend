import { ResourcesService } from 'src/resources/resources.service';
import { Task } from 'src/tasks/tasks.entity';
import { BadRequestException } from '@nestjs/common';
import { Processor } from 'src/wizard/processors/processor.abstract';
import { UserService } from 'src/user/user.service';

export class CollectProcessor extends Processor {
  constructor(
    private readonly userService: UserService,
    private readonly resourcesService: ResourcesService,
  ) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    if (!task.payload?.resourceId) {
      throw new BadRequestException('Invalid task payload');
    }
    const resourceId = task.payload.resourceId;
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
