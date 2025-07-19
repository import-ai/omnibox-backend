import { ResourcesService } from 'src/resources/resources.service';
import { Task } from 'src/tasks/tasks.entity';
import { BadRequestException } from '@nestjs/common';
import { Processor } from 'src/wizard/processors/processor.abstract';

export class CollectProcessor extends Processor {
  constructor(protected readonly resourcesService: ResourcesService) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    const resourceId = task.payload?.resource_id || task.payload?.resourceId;
    if (!resourceId) {
      throw new BadRequestException('Invalid task payload');
    }
    if (task.exception) {
      await this.resourcesService.update(task.userId, resourceId, {
        namespaceId: task.namespaceId,
        content: task.exception.error,
      });
      return {};
    } else if (task.output) {
      const { markdown, title, ...attrs } = task.output || {};
      const resource = await this.resourcesService.get(resourceId);
      const mergedAttrs = { ...(resource?.attrs || {}), ...attrs };
      await this.resourcesService.update(task.userId, resourceId, {
        namespaceId: task.namespaceId,
        name: title,
        content: markdown,
        attrs: mergedAttrs,
      });
      return { resourceId };
    }
    return {};
  }
}
