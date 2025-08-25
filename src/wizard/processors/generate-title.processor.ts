import { Task } from 'omniboxd/tasks/tasks.entity';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { BadRequestException } from '@nestjs/common';
import { isEmpty } from 'omniboxd/utils/is-empty';

export class GenerateTitleProcessor extends Processor {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
  ) {
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
    } else if (task.output && task.output.title) {
      // Process title from external service output
      const generatedTitle = task.output.title;

      if (typeof generatedTitle === 'string' && generatedTitle.trim()) {
        // Update the resource with generated title
        await this.namespaceResourcesService.update(task.userId, resourceId, {
          namespaceId: task.namespaceId,
          name: generatedTitle.trim(),
        });

        return { resourceId, title: generatedTitle.trim() };
      }
    }

    return {};
  }
}
