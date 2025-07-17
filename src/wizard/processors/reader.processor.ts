import { CollectProcessor } from 'src/wizard/processors/collect.processor';
import { Task } from 'src/tasks/tasks.entity';
import { ResourcesService } from 'src/resources/resources.service';
import { MinioService } from 'src/resources/minio/minio.service';

export class ReaderProcessor extends CollectProcessor {
  constructor(
    protected readonly resourcesService: ResourcesService,
    protected readonly minioService: MinioService,
  ) {
    super(resourcesService);
  }

  async process(task: Task): Promise<Record<string, any>> {
    if (task.output?.images) {
      const images: Record<string, string> = task.output.images;
      for (const [key, base64] of Object.entries(images)) {
        // TODO dynamic get mime type
        await this.minioService.putBase64(key, base64, 'image/jpeg');
      }
      // TODO remove images from task output
    }
    if (task.output?.markdown) {
      return await super.process(task);
    } else {
      return {};
    }
  }
}
