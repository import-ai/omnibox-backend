import { Task } from 'omniboxd/tasks/tasks.entity';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { BadRequestException } from '@nestjs/common';
import { isEmpty } from 'omniboxd/utils/is-empty';

export class ExtractTagsProcessor extends Processor {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly tagService: TagService,
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
    } else if (task.output && task.output.tags) {
      // Process tags from external service output
      const tagNames = Array.isArray(task.output.tags) ? task.output.tags : [];

      // Convert tag names to tag IDs
      const tagIds: string[] = [];
      for (const tagName of tagNames) {
        if (typeof tagName === 'string' && tagName.trim()) {
          const trimmedTagName = tagName.trim();
          let tag = await this.tagService.findByName(
            task.namespaceId,
            trimmedTagName,
          );

          if (!tag) {
            // Create new tag if it doesn't exist
            tag = await this.tagService.create(task.namespaceId, {
              name: trimmedTagName,
            });
          }

          tagIds.push(tag.id);
        }
      }

      // Update the resource with extracted tag IDs from external service
      await this.resourcesService.update(task.userId, resourceId, {
        namespaceId: task.namespaceId,
        tag_ids: tagIds,
      });

      return { resourceId, tags: tagNames, tagIds };
    }

    return {};
  }
}
