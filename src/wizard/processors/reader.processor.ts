import { CollectProcessor } from 'omnibox-backend/wizard/processors/collect.processor';
import { Task } from 'omnibox-backend/tasks/tasks.entity';
import { ResourcesService } from 'omnibox-backend/resources/resources.service';
import { MinioService } from 'omnibox-backend/resources/minio/minio.service';
import { BadRequestException } from '@nestjs/common';

interface Image {
  name?: string;
  link: string;
  data: string;
  mimetype: string;
}

export class ReaderProcessor extends CollectProcessor {
  constructor(
    protected readonly resourcesService: ResourcesService,
    protected readonly minioService: MinioService,
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
        const { id } = await this.minioService.put(
          image.name || image.link,
          stream,
          image.mimetype,
          {
            metadata: {
              namespaceId: task.namespaceId,
              resourceId,
              userId: task.userId,
            },
          },
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
