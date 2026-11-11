import { I18nService } from 'nestjs-i18n';
import { Task } from 'omniboxd/tasks/tasks.entity';

import {
  buildTaskErrorContent,
  isTaskErrorContent,
} from './task-error-content';

const i18n = {
  t: jest.fn(
    (key, options) => `${key}: ${options.lang ?? 'zh'} ${options.args.limit}`,
  ),
} as unknown as I18nService;
it('renders byte limits before the duration/pages schema and supports retry recognition', () => {
  const task = {
    exception: {
      type: 'InsufficientQuotaError',
      details: {
        code: 'FILE_SIZE_LIMIT_EXCEEDED',
        requested_amount: 11 * 1024 * 1024,
        limit_amount: 10 * 1024 * 1024,
      },
    },
  } as unknown as Task;
  const content = buildTaskErrorContent(task, i18n, 'en');
  expect(content).toBe('task.errors.fileSizeLimitExceeded: en 10');
  expect(isTaskErrorContent(content, [task], i18n)).toBe(true);
});
it('keeps old code-only size failures informative without fabricating a limit', () => {
  const task = {
    exception: {
      type: 'InsufficientQuotaError',
      details: { code: 'FILE_SIZE_LIMIT_EXCEEDED' },
    },
  } as unknown as Task;
  expect(buildTaskErrorContent(task, i18n)).toContain(
    'fileSizeLimitExceededUnknown',
  );
});

it('uses the task creator language rather than the worker callback language', () => {
  const task = {
    payload: { user: { options: { language: 'zh-CN' } } },
    exception: {
      details: { code: 'FILE_SIZE_LIMIT_EXCEEDED', limit_amount: 10485760 },
    },
  } as unknown as Task;
  expect(buildTaskErrorContent(task, i18n)).toBe(
    'task.errors.fileSizeLimitExceeded: zh 10',
  );
});
