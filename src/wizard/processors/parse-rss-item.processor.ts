import { HttpStatus } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { Repository } from 'typeorm';

export class ParseRssItemProcessor extends Processor {
  constructor(
    private readonly rssItemContentRepository: Repository<RssItemContent>,
    private readonly i18n: I18nService,
  ) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    const contentId =
      task.payload?.rss_item_content_id ?? task.payload?.rssItemContentId;
    if (typeof contentId !== 'string' || !contentId) {
      const message = this.i18n.t('wizard.errors.invalidTaskPayload');
      throw new AppException(
        message,
        'INVALID_TASK_PAYLOAD',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (task.exception && !isEmpty(task.exception)) {
      return {};
    }

    const markdown = task.output?.markdown;
    if (typeof markdown !== 'string') {
      return {};
    }

    const result = await this.rssItemContentRepository.update(contentId, {
      parsedContent: markdown,
    });
    if (!result.affected) {
      const message = this.i18n.t('rssFolder.errors.itemNotFound');
      throw new AppException(
        message,
        'RSS_ITEM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return { rssItemContentId: contentId };
  }
}
