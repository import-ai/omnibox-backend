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
    let markdown: string | undefined = task.output?.markdown;
    if (!markdown) {
      return {};
    }
    if (task.output?.images) {
      const images: Image[] = task.output.images;
      for (const image of images) {
        const stream = Buffer.from(image.data, 'base64');
        const { id } = await this.minioService.put(
          image.name || image.link,
          stream,
          image.mimetype,
        );
        markdown = markdown.replaceAll(image.link, `/api/v1/images/${id}`);
      }
      task.output.images = undefined;
      task.output.markdown = markdown;
    }
    return await super.process(task);
  }
}
