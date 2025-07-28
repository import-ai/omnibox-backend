import { CollectProcessor } from 'omniboxd/wizard/processors/collect.processor';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { BadRequestException } from '@nestjs/common';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';

interface Image {
  name?: string;
  link: string;
  data: string;
  mimetype: string;
}

export class ReaderProcessor extends CollectProcessor {
  constructor(
    protected readonly resourcesService: ResourcesService,
    protected readonly attachmentsService: AttachmentsService,
  ) {
    super(resourcesService);
  }

  async process(task: Task): Promise<Record<string, any>> {
    let markdown: string | undefined = task.output?.markdown;
    if (!markdown) {
      return {};
    }
    if (task.output?.images) {
      const images: Image[] = task.output.images;
      for (const image of images) {
        const stream = Buffer.from(image.data, 'base64');
        const resourceId =
          task.payload?.resource_id || task.payload?.resourceId;
        if (!resourceId) {
          throw new BadRequestException('Invalid task payload');
        }
        const id = await this.attachmentsService.uploadAttachment(
          task.namespaceId,
          resourceId,
          task.userId,
          image.name || image.link,
          stream,
          image.mimetype,
        );
        markdown = markdown.replaceAll(
          image.link,
          `/api/v1/attachments/images/${id}`,
        );
      }
      task.output.images = undefined;
      task.output.markdown = markdown;
    }
    return await super.process(task);
  }
}
