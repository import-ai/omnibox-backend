import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';

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
  ...overrides,
});

describe('WizardService', () => {
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
        {} as any,
        { getResourceOrFail: jest.fn() } as any,
        i18n as any,
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
