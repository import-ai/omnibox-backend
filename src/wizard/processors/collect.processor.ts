import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { BadRequestException } from '@nestjs/common';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { TagService } from 'omniboxd/tag/tag.service';
import { ProcessedImage } from 'omniboxd/wizard/types/wizard.types';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';

export class CollectProcessor extends Processor {
  constructor(
    protected readonly namespaceResourcesService: NamespaceResourcesService,
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
      await this.namespaceResourcesService.update(
        task.userId,
        resourceId,
        Object.assign(new UpdateResourceDto(), {
          namespaceId: task.namespaceId,
          content: task.exception.error,
        }),
      );
      return {};
    } else if (task.output) {
      const { markdown, title, ...attrs } = task.output || {};
      delete attrs.images; // Remove images which is only required for task

      let tagIds: string[] | undefined = undefined;
      const tags: string[] | undefined = attrs?.metadata?.tags;
      if (Array.isArray(tags) && tags.length > 0) {
        attrs.metadata.tags = undefined;
        tagIds = await this.tagService.getOrCreateTagsByNames(
          task.namespaceId,
          tags,
        );
      }

      let processedMarkdown: string = markdown || '';
      const images: ProcessedImage[] | undefined = task.output.images;
      if (Array.isArray(images) && images.length > 0) {
        for (const image of images) {
          processedMarkdown = processedMarkdown.replaceAll(
            image.originalLink,
            `attachments/${image.attachmentId}`,
          );
        }
      }

      const resource = await this.namespaceResourcesService.get(resourceId);
      const mergedAttrs = { ...(resource?.attrs || {}), ...attrs };
      await this.namespaceResourcesService.update(
        task.userId,
        resourceId,
        Object.assign(new UpdateResourceDto(), {
          namespaceId: task.namespaceId,
          name: title,
          content: processedMarkdown,
          attrs: mergedAttrs,
          tag_ids: tagIds,
        }),
      );
      return { resourceId, tagIds };
    }
    return {};
  }
}
