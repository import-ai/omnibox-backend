import { Injectable, BadRequestException } from '@nestjs/common';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { isEmpty } from 'omniboxd/utils/is-empty';

@Injectable()
export class TagExtractProcessor extends Processor {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly tagService: TagService,
  ) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    const resourceId = task.payload?.resource_id || task.payload?.resourceId;
    if (!resourceId) {
      throw new BadRequestException('Invalid task payload');
    }

    if (task.exception && !isEmpty(task.exception)) {
      // Log the error but don't fail the overall process
      console.warn(
        `Tag extraction failed for resource ${resourceId}:`,
        task.exception,
      );
      return { resourceId };
    }

    if (task.output && task.output.tags && Array.isArray(task.output.tags)) {
      const suggestedTags: string[] = task.output.tags;

      if (suggestedTags.length > 0) {
        try {
          // Get the current resource
          const resource = await this.resourcesService.get(resourceId);
          if (!resource) {
            throw new BadRequestException(`Resource ${resourceId} not found`);
          }

          // Create or find tags in the namespace
          const tagIds: string[] = [];
          for (const tagName of suggestedTags) {
            if (tagName && tagName.trim()) {
              const tag = await this.tagService.create(resource.namespaceId, {
                name: tagName.trim(),
              });
              tagIds.push(tag.id);
            }
          }

          // Update the resource with the new tags, merging with existing ones
          const existingTags = resource.tags || [];
          const allTags = [...new Set([...existingTags, ...tagIds])]; // Remove duplicates

          await this.resourcesService.update(task.userId, resourceId, {
            namespaceId: task.namespaceId,
            tags: allTags,
          });

          return {
            resourceId,
            tagsAdded: tagIds.length,
            totalTags: allTags.length,
          };
        } catch (error) {
          console.error(
            `Error processing tags for resource ${resourceId}:`,
            error,
          );
          return { resourceId, error: error.message };
        }
      }
    }

    return { resourceId };
  }
}
