import { I18nService } from 'nestjs-i18n';
import { ResourceRetryService } from 'omniboxd/namespace-resources/resource-retry.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TaskRetryService } from 'omniboxd/task-retry/task-retry.service';
import { TaskDto } from 'omniboxd/tasks/dto/task.dto';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';

describe('ResourceRetryService batch preparation', () => {
  let service: ResourceRetryService;
  let events: string[];
  let permissionsService: { userHasPermissionOrFail: jest.Mock };
  let resourcesService: {
    getResourceOrFail: jest.Mock;
    updateResource: jest.Mock;
  };
  let tasksService: {
    getTaskEntitiesByResourceId: jest.Mock;
    applyRerun: jest.Mock;
  };
  let taskRetryService: { prepare: jest.Mock };
  let wizardTaskService: { emitFileReaderTask: jest.Mock };

  const resource = (overrides: Partial<Resource> = {}): Resource =>
    ({
      id: 'resource-1',
      namespaceId: 'ns-1',
      userId: 'user-1',
      resourceType: ResourceType.FILE,
      fileId: 'file-1',
      attrs: {},
      content: '',
      ...overrides,
    }) as Resource;

  const task = (overrides: Partial<Task> = {}): Task =>
    ({
      id: 'task-1',
      namespaceId: 'ns-1',
      userId: 'user-1',
      priority: '5',
      function: 'extract_tags',
      input: { text: 'x' },
      payload: { resource_id: 'resource-1' },
      status: TaskStatus.ERROR,
      canceledAt: null,
      retriedFromTaskId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Task;

  beforeEach(() => {
    events = [];
    permissionsService = {
      userHasPermissionOrFail: jest.fn().mockResolvedValue(undefined),
    };
    resourcesService = {
      getResourceOrFail: jest.fn().mockResolvedValue(resource()),
      updateResource: jest.fn().mockImplementation(() => {
        events.push('clear');
      }),
    };
    tasksService = {
      getTaskEntitiesByResourceId: jest.fn().mockResolvedValue([task()]),
      applyRerun: jest.fn().mockImplementation((plan) => {
        events.push(`apply:${plan.original.id}`);
        return Promise.resolve({ id: `new-${plan.original.id}` } as TaskDto);
      }),
    };
    taskRetryService = {
      prepare: jest.fn().mockImplementation((prepared: Task) => {
        events.push(`prepare:${prepared.id}`);
        return Promise.resolve({
          original: prepared,
          function: prepared.function,
          input: prepared.input,
        });
      }),
    };
    wizardTaskService = { emitFileReaderTask: jest.fn() };

    service = new ResourceRetryService(
      permissionsService as unknown as PermissionsService,
      resourcesService as unknown as ResourcesService,
      tasksService as unknown as TasksService,
      taskRetryService as unknown as TaskRetryService,
      wizardTaskService as unknown as WizardTaskService,
      { t: (key: string) => key } as unknown as I18nService,
    );
  });

  it('prepares the whole batch before clearing or emitting anything', async () => {
    const first = task({
      id: 'task-1',
      function: 'file_reader_text',
      exception: { error: 'boom' },
    });
    const second = task({ id: 'task-2', function: 'upsert_index' });
    resourcesService.getResourceOrFail.mockResolvedValue(
      resource({ content: 'error' }),
    );
    tasksService.getTaskEntitiesByResourceId.mockResolvedValue([first, second]);

    const rerun = await service.retry('ns-1', 'user-1', 'resource-1');

    expect(events).toEqual([
      'prepare:task-1',
      'prepare:task-2',
      'clear',
      'apply:task-1',
      'apply:task-2',
    ]);
    expect(taskRetryService.prepare).toHaveBeenNthCalledWith(1, first, {
      namespaceId: 'ns-1',
      userId: 'user-1',
      resource: expect.objectContaining({ id: 'resource-1' }),
    });
    expect(taskRetryService.prepare).toHaveBeenNthCalledWith(2, second, {
      namespaceId: 'ns-1',
      userId: 'user-1',
      resource: expect.objectContaining({ id: 'resource-1' }),
    });
    expect(rerun).toEqual([{ id: 'new-task-1' }, { id: 'new-task-2' }]);
  });

  it('writes nothing when any task in the batch fails to prepare', async () => {
    const first = task({
      id: 'task-1',
      function: 'file_reader_text',
      exception: { error: 'boom' },
    });
    const second = task({ id: 'task-2', function: 'file_reader' });
    resourcesService.getResourceOrFail.mockResolvedValue(
      resource({ content: 'error' }),
    );
    tasksService.getTaskEntitiesByResourceId.mockResolvedValue([first, second]);
    taskRetryService.prepare
      .mockImplementationOnce(() => {
        events.push('prepare:task-1');
        return Promise.resolve({
          original: first,
          function: first.function,
          input: first.input,
        });
      })
      .mockImplementationOnce(() => {
        events.push('prepare:task-2');
        return Promise.reject(
          Object.assign(new Error('bad input'), {
            code: 'INVALID_FILE_READER_INPUT',
          }),
        );
      });

    await expect(
      service.retry('ns-1', 'user-1', 'resource-1'),
    ).rejects.toMatchObject({ code: 'INVALID_FILE_READER_INPUT' });

    expect(events).toEqual(['prepare:task-1', 'prepare:task-2']);
    expect(resourcesService.updateResource).not.toHaveBeenCalled();
    expect(tasksService.applyRerun).not.toHaveBeenCalled();
  });

  it('skips failures a later attempt already replaced', async () => {
    const superseded = task({ id: 'task-1' });
    const retryOfIt = task({
      id: 'task-2',
      retriedFromTaskId: 'task-1',
      status: TaskStatus.FINISHED,
    });
    tasksService.getTaskEntitiesByResourceId.mockResolvedValue([
      retryOfIt,
      superseded,
    ]);
    resourcesService.getResourceOrFail.mockResolvedValue(
      resource({ content: 'already parsed' }),
    );

    await expect(
      service.retry('ns-1', 'user-1', 'resource-1'),
    ).rejects.toMatchObject({ code: 'RETRY_NOT_ELIGIBLE' });
    expect(taskRetryService.prepare).not.toHaveBeenCalled();
  });

  it.each([TaskStatus.PENDING, TaskStatus.RUNNING])(
    'rejects when a %s task still exists',
    async (status) => {
      tasksService.getTaskEntitiesByResourceId.mockResolvedValue([
        task({ status }),
      ]);

      await expect(
        service.retry('ns-1', 'user-1', 'resource-1'),
      ).rejects.toMatchObject({ code: 'RETRY_ALREADY_RUNNING' });
      expect(taskRetryService.prepare).not.toHaveBeenCalled();
    },
  );

  it('keeps the blank-resource fallback unchanged', async () => {
    tasksService.getTaskEntitiesByResourceId.mockResolvedValue([]);
    const blank = resource({ content: '' });
    resourcesService.getResourceOrFail.mockResolvedValue(blank);
    wizardTaskService.emitFileReaderTask.mockResolvedValue(
      task({ id: 'blank-task', status: TaskStatus.PENDING }),
    );

    const rerun = await service.retry('ns-1', 'user-1', 'resource-1');

    expect(wizardTaskService.emitFileReaderTask).toHaveBeenCalledWith(
      'user-1',
      blank,
    );
    expect(rerun).toHaveLength(1);
    expect(rerun[0]).toMatchObject({ id: 'blank-task' });
  });

  it('refuses to retry when there is nothing to re-run', async () => {
    tasksService.getTaskEntitiesByResourceId.mockResolvedValue([]);
    resourcesService.getResourceOrFail.mockResolvedValue(
      resource({ content: 'real content' }),
    );

    await expect(
      service.retry('ns-1', 'user-1', 'resource-1'),
    ).rejects.toMatchObject({ code: 'RETRY_NOT_ELIGIBLE' });
    expect(taskRetryService.prepare).not.toHaveBeenCalled();
  });
});
