/* eslint-disable @typescript-eslint/unbound-method */
import { I18nService } from 'nestjs-i18n';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { Repository } from 'typeorm';

import { ParseRssItemProcessor } from './parse-rss-item.processor';

describe('ParseRssItemProcessor', () => {
  const repository = {
    update: jest.fn(),
  } as unknown as jest.Mocked<Repository<RssItemContent>>;
  const i18n = {
    t: jest.fn((key: string) => key),
  } as unknown as I18nService;
  const processor = new ParseRssItemProcessor(repository, i18n);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores parsed markdown on the targeted RSS content', async () => {
    repository.update.mockResolvedValue({
      affected: 1,
      generatedMaps: [],
      raw: [],
    });
    const task = {
      payload: { rss_item_content_id: 'content-1' },
      output: { markdown: '# Article' },
      exception: null,
    } as unknown as Task;

    await expect(processor.process(task)).resolves.toEqual({
      rssItemContentId: 'content-1',
    });
    expect(repository.update).toHaveBeenCalledWith('content-1', {
      parsedContent: '# Article',
    });
  });

  it('does not change parsed content when the task failed', async () => {
    const task = {
      payload: { rss_item_content_id: 'content-1' },
      output: null,
      exception: { error: 'failed' },
    } as unknown as Task;

    await expect(processor.process(task)).resolves.toEqual({});
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects callbacks without an RSS content id', async () => {
    const task = {
      payload: {},
      output: { markdown: '# Article' },
      exception: null,
    } as unknown as Task;

    await expect(processor.process(task)).rejects.toMatchObject({
      code: 'INVALID_TASK_PAYLOAD',
    });
  });
});
