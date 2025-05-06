import { ResourcesService } from 'src/resources/resources.service';
import { Task } from 'src/tasks/tasks.entity';
import { BadRequestException } from '@nestjs/common';
import { Processor } from 'src/wizard/processors/processor.abstract';

export class CollectProcessor extends Processor {
  constructor(private readonly resourcesService: ResourcesService) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    if (!task.payload?.resourceId) {
      throw new BadRequestException('Invalid task payload');
    }
    const resourceId = task.payload.resourceId;
    if (task.exception) {
      await this.resourcesService.update(task.user, resourceId, {
        namespaceId: task.namespace.id,
        content: task.exception.error,
      });
      return {};
    } else if (task.output) {
      const { markdown, title, ...attrs } = task.output || {};
      await this.resourcesService.update(task.user, resourceId, {
        namespaceId: task.namespace.id,
        name: title,
        content: markdown,
        attrs,
      });
      return { resourceId };
    }
    return {};
  }
}
