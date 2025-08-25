import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { BadRequestException } from '@nestjs/common';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { isEmpty } from 'omniboxd/utils/is-empty';

export class CollectProcessor extends Processor {
  constructor(
    protected readonly namespaceResourcesService: NamespaceResourcesService,
  ) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    const resourceId = task.payload?.resource_id || task.payload?.resourceId;
    if (!resourceId) {
      throw new BadRequestException('Invalid task payload');
    }
    if (task.exception && !isEmpty(task.exception)) {
      await this.namespaceResourcesService.update(task.userId, resourceId, {
        namespaceId: task.namespaceId,
        content: task.exception.error,
      });
      return {};
    } else if (task.output) {
      const { markdown, title, ...attrs } = task.output || {};
      const resource = await this.namespaceResourcesService.get(resourceId);
      const mergedAttrs = { ...(resource?.attrs || {}), ...attrs };
      await this.namespaceResourcesService.update(task.userId, resourceId, {
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
