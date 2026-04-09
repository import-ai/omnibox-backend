import { Task } from 'omniboxd/tasks/tasks.entity';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';

export class CollectUrlProcessor extends Processor {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
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
      // Handle task exceptions - could log error or update resource with error state
      return {};
    } else if (task.output && task.output.title) {
      // Process title from the scraped URL output
      const scrapedTitle = task.output.title;

      if (typeof scrapedTitle === 'string' && scrapedTitle.trim()) {
        // Update the resource with scraped title
        await this.namespaceResourcesService.update(
          task.namespaceId,
          task.userId,
          resourceId,
          Object.assign(new UpdateResourceDto(), {
            namespaceId: task.namespaceId,
            name: scrapedTitle.trim(),
          }),
          true, // autoRenameOnConflict for scraped titles
        );

        return { resourceId, title: scrapedTitle.trim() };
      }
    }

    return {};
  }
}
