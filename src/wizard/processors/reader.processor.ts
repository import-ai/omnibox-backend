import { CollectProcessor } from 'omniboxd/wizard/processors/collect.processor';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ProcessedImage } from 'omniboxd/wizard/types/wizard.types';

export class ReaderProcessor extends CollectProcessor {
  constructor(
    protected readonly namespaceResourcesService: NamespaceResourcesService,
  ) {
    super(namespaceResourcesService);
  }

  async process(task: Task): Promise<Record<string, any>> {
    let markdown: string | undefined = task.output?.markdown;
    if (!markdown) {
      return {};
    }

    // Handle markdown replacement for preprocessed images
    if (task.output?.images && Array.isArray(task.output.images)) {
      const processedImages: ProcessedImage[] = task.output.images;
      for (const processedImage of processedImages) {
        markdown = markdown.replaceAll(
          processedImage.originalLink,
          `attachments/${processedImage.attachmentId}`,
        );
      }
      // Update task output with processed markdown and clear images
      task.output.markdown = markdown;
      task.output.images = undefined;
    }

    return await super.process(task);
  }
}
