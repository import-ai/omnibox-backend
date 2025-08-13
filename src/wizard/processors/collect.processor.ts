import { ResourcesService } from 'omniboxd/resources/resources.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { BadRequestException } from '@nestjs/common';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { Repository } from 'typeorm';
import { WizardTask } from 'omniboxd/resources/wizard.task.service';

export class CollectProcessor extends Processor {
  constructor(
    protected readonly resourcesService: ResourcesService,
    protected readonly taskRepository?: Repository<Task>,
  ) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    const resourceId = task.payload?.resource_id || task.payload?.resourceId;
    if (!resourceId) {
      throw new BadRequestException('Invalid task payload');
    }
    if (task.exception && !isEmpty(task.exception)) {
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

      // Trigger tag extraction if we have content and task repository
      if (markdown && this.taskRepository) {
        try {
          const updatedResource = await this.resourcesService.get(resourceId);
          if (updatedResource) {
            await WizardTask.tagExtract.upsert(
              task.userId,
              updatedResource,
              this.taskRepository,
              3, // Higher priority than default for tag extraction
            );
          }
        } catch (error) {
          // Log error but don't fail the main task
          console.warn(
            `Failed to create tag extraction task for resource ${resourceId}:`,
            error,
          );
        }
      }

      return { resourceId };
    }
    return {};
  }
}
