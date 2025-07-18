import { CollectProcessor } from 'src/wizard/processors/collect.processor';
import { Task } from 'src/tasks/tasks.entity';
import { ResourcesService } from 'src/resources/resources.service';
import { MinioService } from 'src/resources/minio/minio.service';

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
    if (task.output?.images) {
      const images: Image[] = task.output.images;
      for (const image of images) {
        const stream = Buffer.from(image.data, 'base64');
        await this.minioService.put(
          image.name || image.link,
          stream,
          image.mimetype,
          {
            savePath: image.link,
          },
        );
      }
      task.output.images = undefined;
    }
    if (task.output?.markdown) {
      return await super.process(task);
    } else {
      return {};
    }
  }
}
