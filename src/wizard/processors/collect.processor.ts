import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { TagService } from 'omniboxd/tag/tag.service';
import { ProcessedImage } from 'omniboxd/wizard/types/wizard.types';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';

export class CollectProcessor extends Processor {
  constructor(
    protected readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly tagService: TagService,
    private readonly i18n: I18nService,
  ) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    const resourceId = task.payload?.resource_id || task.payload?.resourceId;
    if (!resourceId) {
      const message = this.i18n.t('wizard.errors.invalidTaskPayload');
      throw new AppException(
        message,
        'INVALID_TASK_PAYLOAD',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (task.exception && !isEmpty(task.exception)) {
      const content = this.buildErrorContent(task);
      await this.namespaceResourcesService.update(
        task.userId,
        resourceId,
        Object.assign(new UpdateResourceDto(), {
          namespaceId: task.namespaceId,
          content,
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

      const resource = await this.resourcesService.getResourceOrFail(
        task.namespaceId,
        resourceId,
      );
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

  private buildErrorContent(task: Task): string {
    const exceptionType = (task.exception as any)?.type;
    const details = (task.exception as any)?.details as
      | {
          code?: string;
          usageType?: string;
          requestedAmount?: number;
          limitAmount?: number;
          remainingAmount?: number;
        }
      | undefined;

    // Only customize for quota-related errors coming from wizard-pro
    if (
      exceptionType === 'InsufficientQuotaError' &&
      details &&
      typeof details.requestedAmount === 'number'
    ) {
      const resourceLabel = this.getResourceLabel(details.usageType);
      const isPageType =
        details.usageType === 'pdf' || details.usageType === 'image';
      const valueLabel = isPageType ? '页数' : '时长';
      const unitLabel = isPageType ? '页' : '秒';

      // 1. 单次解析上限不足
      if (
        typeof details.limitAmount === 'number' &&
        (details.code === 'DOC_PARSE_LIMIT_EXCEEDED' ||
          details.code === 'VIDEO_AUDIO_PARSE_LIMIT_EXCEEDED')
      ) {
        return `当前 ${resourceLabel} 的${
          valueLabel
        }为 ${details.requestedAmount}${unitLabel}，超出单次解析的上限：${details.limitAmount}${unitLabel}`;
      }

      // 2. 总额度不足
      if (
        typeof details.remainingAmount === 'number' &&
        details.code === 'INSUFFICIENT_QUOTA'
      ) {
        return `当前 ${resourceLabel} 的${
          valueLabel
        }为 ${details.requestedAmount}${unitLabel}，当前剩余额度为：${details.remainingAmount}${unitLabel}`;
      }
    }

    // Fallback generic error
    return 'error';
  }

  private getResourceLabel(usageType?: string): string {
    switch (usageType) {
      case 'video':
      case 'audio':
        return '视频/音频';
      case 'pdf':
        return 'PDF';
      case 'image':
        return '图片';
      default:
        return '文件';
    }
  }
}
