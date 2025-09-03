import { Task } from 'omniboxd/tasks/tasks.entity';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { BadRequestException } from '@nestjs/common';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { ExtractTagsOutputDto } from 'omniboxd/wizard/processors/dto/extract-tags.output.dto';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';

export class ExtractTagsProcessor extends Processor {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly tagService: TagService,
  ) {
    super();
  }

  async process(
    task: Task & { output: ExtractTagsOutputDto },
  ): Promise<Record<string, any>> {
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
      const tagIds: string[] = await this.tagService.getOrCreateTagsByNames(
        task.namespaceId,
        tagNames,
      );

      // Update the resource with extracted tag IDs from external service
      await this.namespaceResourcesService.update(
        task.userId,
        resourceId,
        Object.assign(new UpdateResourceDto(), {
          namespaceId: task.namespaceId,
          tag_ids: tagIds,
        }),
      );

      return { resourceId, tags: tagNames, tagIds };
    }

    return {};
  }
}
