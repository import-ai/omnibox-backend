import { Task } from 'omniboxd/tasks/tasks.entity';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { BadRequestException } from '@nestjs/common';
import { isEmpty } from 'omniboxd/utils/is-empty';

export class ExtractTagsProcessor extends Processor {
  constructor(private readonly resourcesService: ResourcesService) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    const resourceId = task.payload?.resource_id || task.payload?.resourceId;
    if (!resourceId) {
      throw new BadRequestException(
        'Invalid task payload: missing resource_id',
      );
    }

    if (task.exception && !isEmpty(task.exception)) {
      // Handle task exceptions - could log error or update resource with error state
      return {};
    } else if (task.output && task.output.tags) {
      // Process tags from external service output
      const tags = Array.isArray(task.output.tags) ? task.output.tags : [];

      // Update the resource with extracted tags from external service
      await this.resourcesService.update(task.userId, resourceId, {
        namespaceId: task.namespaceId,
        tag_ids: tags,
      });

      return { resourceId, tags };
    }

    return {};
  }
}
