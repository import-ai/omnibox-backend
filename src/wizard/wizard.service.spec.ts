import { validate } from 'class-validator';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';

import { OpenCollectUrlRequestDto } from './dto/collect-url-request.dto';
import { InternalCollectUrlRequestDto } from './dto/internal-collect-url-request.dto';
import { WizardService } from './wizard.service';

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-id',
  namespaceId: 'namespace-id',
  userId: 'user-id',
  function: 'file_reader_pdf',
  input: {},
  payload: { resource_id: 'resource-id' },
  output: null,
  exception: null,
  priority: '5',
  startedAt: new Date('2026-05-21T00:00:00Z'),
  endedAt: null,
  canceledAt: null,
  lastHeartbeat: null,
  createdAt: new Date('2026-05-21T00:00:00Z'),
  updatedAt: new Date('2026-05-21T00:00:00Z'),
  deletedAt: null,
  resourceId: 'resource-id',
  workerId: null,
  status: TaskStatus.RUNNING,
  numSchedules: 0,
  ...overrides,
});

describe('WizardService', () => {
  describe('collectUrl', () => {
    it('accepts localhost URLs through public and internal request validation', async () => {
      const url =
        'http://localhost:5193/abc123/0123456789ABCDEF/edit?mode=write#top';
      const publicRequest = Object.assign(new OpenCollectUrlRequestDto(), {
        url,
      });
      const internalRequest = Object.assign(
        new InternalCollectUrlRequestDto(),
        { url, parentId: 'parent-id' },
      );

      await expect(validate(publicRequest)).resolves.toHaveLength(0);
      await expect(validate(internalRequest)).resolves.toHaveLength(0);
    });

    it.each([
      [
        'https://www.omnibox.pro',
        'https://www.omnibox.pro/1DnZTW/DO3H9lDu8AXFjbuJ',
      ],
      [
        'https://box.example.com',
        'https://box.example.com/abc123/0123456789ABCDEF',
      ],
      [
        'http://localhost:5193',
        'http://localhost:3000/any-path?mode=write#top',
      ],
    ])('rejects its own hostname: %s', async (baseUrl, url) => {
      const namespaceResourcesService = { create: jest.fn() };
      const i18n = { t: jest.fn((key: string) => key) };
      const configService = { get: jest.fn().mockReturnValue(baseUrl) };
      const service = new WizardService(
        {} as any,
        {} as any,
        namespaceResourcesService as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        i18n as any,
        configService as any,
      );

      await expect(
        service.collectUrl('namespace-id', 'user-id', url, 'parent-id'),
      ).rejects.toMatchObject({
        code: 'CANNOT_COLLECT_OMNIBOX_URL',
      });
      expect(i18n.t).toHaveBeenCalledWith(
        'wizard.errors.cannotCollectOmniBoxUrl',
      );
      expect(namespaceResourcesService.create).not.toHaveBeenCalled();
    });

    it('allows a different hostname regardless of its path', async () => {
      const wizardTaskService = { emitCollectUrlTask: jest.fn() };
      const namespaceResourcesService = {
        create: jest.fn().mockResolvedValue({ id: 'resource-id' }),
      };
      const service = new WizardService(
        wizardTaskService as any,
        {} as any,
        namespaceResourcesService as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { t: jest.fn() } as any,
        { get: jest.fn().mockReturnValue('https://box.example.com') } as any,
      );

      await expect(
        service.collectUrl(
          'namespace-id',
          'user-id',
          'https://external.example/abc123/0123456789ABCDEF',
          'parent-id',
        ),
      ).resolves.toMatchObject({ resourceId: 'resource-id' });
      expect(namespaceResourcesService.create).toHaveBeenCalled();
    });
  });

  describe('taskDoneCallback', () => {
    it('keeps content-too-long callbacks as error and does not dispatch next tasks', async () => {
      const task = createTask();
      const taskRepository = {
        findOneOrFail: jest.fn().mockResolvedValue(task),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const wizardTaskService = { taskRepository };
      const tasksService = {
        callTaskHook: jest.fn().mockResolvedValue(undefined),
        emitTask: jest.fn(),
      };
      const namespaceResourcesService = {
        update: jest.fn().mockResolvedValue(undefined),
      };
      const i18n = { t: jest.fn((key: string) => key) };
      const service = new WizardService(
        wizardTaskService as any,
        tasksService as any,
        namespaceResourcesService as any,
        { getOrCreateTagsByNames: jest.fn() } as any,
        {} as any,
        {} as any,
        { getResourceOrFail: jest.fn() } as any,
        i18n as any,
        { get: jest.fn().mockReturnValue('https://www.omnibox.pro') } as any,
      );
      const message =
        '当前文件内容（32769 字符）超过系统可处理上限（32768 字符），请尝试拆分文档后重新上传。';

      const result = await service.taskDoneCallback({
        id: task.id,
        workerId: 'workerId',
        status: TaskStatus.ERROR,
        exception: {
          code: 'FILE_CONTENT_TOO_LONG',
          error: message,
        },
        output: {
          next_tasks: [{ function: 'extract_tags', input: { text: message } }],
        },
      });

      expect(task.status).toBe(TaskStatus.ERROR);
      expect(task.exception).toEqual(
        expect.objectContaining({
          code: 'FILE_CONTENT_TOO_LONG',
          error: message,
        }),
      );
      expect(namespaceResourcesService.update).toHaveBeenCalledWith(
        'namespace-id',
        'user-id',
        'resource-id',
        expect.objectContaining({ content: message }),
        true,
      );
      expect(tasksService.emitTask).not.toHaveBeenCalled();
      expect(result).toEqual({
        taskId: task.id,
        function: 'file_reader_pdf',
      });
    });
  });
});
