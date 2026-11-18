import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { S3Service } from 'omniboxd/s3/s3.service';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { RerunPlan, TasksService } from 'omniboxd/tasks/tasks.service';

describe('TasksService retry execution', () => {
  let service: TasksService;
  let taskRepository: { findOne: jest.Mock };
  let s3Service: { generateObjectKey: jest.Mock; putObject: jest.Mock };

  const task = (overrides: Partial<Task>): Task =>
    ({
      id: 'task-1',
      namespaceId: 'namespace-1',
      userId: 'user-1',
      priority: '5',
      function: 'file_reader_pdf',
      input: { resource_id: 'resource-1' },
      payload: { resource_id: 'resource-1' },
      status: TaskStatus.ERROR,
      canceledAt: null,
      retriedFromTaskId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Task;

  const plan = (overrides: Partial<RerunPlan> = {}): RerunPlan => ({
    original: task({}),
    function: 'file_reader_pdf',
    input: { title: 'Title', resource_id: 'resource-1' },
    ...overrides,
  });

  beforeEach(async () => {
    taskRepository = { findOne: jest.fn() };
    s3Service = {
      generateObjectKey: jest
        .fn()
        .mockResolvedValue({ objectKey: 'collect/html/gzip/uploaded.html.gz' }),
      putObject: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(Task), useValue: taskRepository },
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: ConfigService, useValue: { get: () => undefined } },
        {
          provide: NamespacesQuotaService,
          useValue: { getNamespaceUsage: jest.fn() },
        },
        { provide: S3Service, useValue: s3Service },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  describe('applyRerun', () => {
    it('emits the planned function and input with the original ownership', async () => {
      const original = task({ status: TaskStatus.ERROR });
      const emitTask = jest
        .spyOn(service, 'emitTask')
        .mockResolvedValue(task({ id: 'task-2', status: TaskStatus.PENDING }));

      const rerun = await service.applyRerun(
        plan({
          original,
          function: 'file_reader_text',
          input: { title: 'Title', resource_id: 'resource-1' },
        }),
      );

      expect(rerun.id).toBe('task-2');
      expect(emitTask).toHaveBeenCalledWith({
        namespaceId: original.namespaceId,
        userId: original.userId,
        priority: original.priority,
        function: 'file_reader_text',
        input: { title: 'Title', resource_id: 'resource-1' },
        payload: original.payload,
        retriedFromTaskId: original.id,
      });
    });

    it('does not infer the function nor check the original status', async () => {
      const emitTask = jest
        .spyOn(service, 'emitTask')
        .mockResolvedValue(task({ id: 'task-2', status: TaskStatus.PENDING }));

      await service.applyRerun(
        plan({
          original: task({ status: TaskStatus.FINISHED, function: 'collect' }),
          function: 'file_reader_pdf',
        }),
      );

      expect(emitTask).toHaveBeenCalledWith(
        expect.objectContaining({ function: 'file_reader_pdf' }),
      );
    });

    it('records the replaced task on the rerun so it can be recognized as superseded', async () => {
      const emitTask = jest
        .spyOn(service, 'emitTask')
        .mockImplementation((data) =>
          Promise.resolve(task({ id: 'task-2', ...data })),
        );

      await service.applyRerun(
        plan({
          original: task({ id: 'failed-task', status: TaskStatus.ERROR }),
        }),
      );

      expect(emitTask).toHaveBeenCalledWith(
        expect.objectContaining({ retriedFromTaskId: 'failed-task' }),
      );
    });

    it('chains the pointer to the immediate predecessor, not the first failure', async () => {
      const emitTask = jest
        .spyOn(service, 'emitTask')
        .mockImplementation((data) =>
          Promise.resolve(task({ id: 'task-3', ...data })),
        );

      await service.applyRerun(
        plan({
          original: task({
            id: 'second-attempt',
            status: TaskStatus.TIMEOUT,
            retriedFromTaskId: 'first-attempt',
          }),
        }),
      );

      expect(emitTask).toHaveBeenCalledWith(
        expect.objectContaining({ retriedFromTaskId: 'second-attempt' }),
      );
    });

    it('uploads inline HTML and replaces it with the S3 key', async () => {
      const emitTask = jest
        .spyOn(service, 'emitTask')
        .mockImplementation((data) =>
          Promise.resolve(task({ id: 'task-2', ...data })),
        );

      await service.applyRerun(
        plan({
          original: task({ function: 'collect_url' }),
          function: 'collect_url',
          input: { url: 'https://example.com', html: '<p>hi</p>' },
        }),
      );

      expect(s3Service.putObject).toHaveBeenCalledTimes(1);
      expect(emitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            url: 'https://example.com',
            html_s3_key: 'collect/html/gzip/uploaded.html.gz',
          },
        }),
      );
    });

    it('reuses a legacy html S3 key without uploading again', async () => {
      const legacyKey = `collect/html/gzip/${'a'.repeat(32)}.gz`;
      const emitTask = jest
        .spyOn(service, 'emitTask')
        .mockImplementation((data) =>
          Promise.resolve(task({ id: 'task-2', ...data })),
        );

      await service.applyRerun(
        plan({
          original: task({ function: 'collect_url' }),
          function: 'collect_url',
          input: { url: 'https://example.com', html: legacyKey },
        }),
      );

      expect(s3Service.putObject).not.toHaveBeenCalled();
      expect(emitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            url: 'https://example.com',
            html_s3_key: legacyKey,
          },
        }),
      );
    });

    it('returns the emitted task as a DTO', async () => {
      jest.spyOn(service, 'emitTask').mockResolvedValue(
        task({
          id: 'task-2',
          status: TaskStatus.PENDING,
          function: 'file_reader_text',
        }),
      );

      const rerun = await service.applyRerun(
        plan({ function: 'file_reader_text' }),
      );

      expect(rerun).toMatchObject({
        id: 'task-2',
        status: TaskStatus.PENDING,
        function: 'file_reader_text',
        namespace_id: 'namespace-1',
      });
    });
  });

  describe('getInNamespace', () => {
    it('scopes the lookup by namespace and id', async () => {
      const original = task({});
      taskRepository.findOne.mockResolvedValue(original);

      const found = await service.getInNamespace('namespace-1', 'task-1');

      expect(found).toBe(original);
      expect(taskRepository.findOne).toHaveBeenCalledWith({
        where: { namespaceId: 'namespace-1', id: 'task-1' },
      });
    });

    it('reports a task in another namespace as not found', async () => {
      taskRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getInNamespace('namespace-2', 'task-1'),
      ).rejects.toMatchObject({
        code: 'TASK_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('pro-only retries', () => {
    const buildService = async (proUrl: string | undefined) => {
      const repository = {
        findOne: jest.fn(),
        create: jest.fn((data: Partial<Task>) => ({ ...data })),
        save: jest.fn((data: Partial<Task>) =>
          Promise.resolve({
            id: 'task-2',
            priority: '5',
            status: TaskStatus.PENDING,
            payload: null,
            exception: null,
            canceledAt: null,
            startedAt: null,
            endedAt: null,
            retriedFromTaskId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          }),
        ),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TasksService,
          { provide: getRepositoryToken(Task), useValue: repository },
          { provide: I18nService, useValue: { t: (key: string) => key } },
          {
            provide: ConfigService,
            useValue: {
              get: (key: string, fallback?: string) =>
                key === 'OBB_PRO_URL' ? proUrl : fallback,
            },
          },
          {
            provide: NamespacesQuotaService,
            useValue: { getNamespaceUsage: jest.fn() },
          },
          { provide: S3Service, useValue: s3Service },
        ],
      }).compile();
      return module.get(TasksService);
    };

    it('keeps a pro-only retry pending when the pro wizard is configured', async () => {
      const proService = await buildService('http://pro.example');

      const rerun = await proService.applyRerun(plan());

      expect(rerun.status).toBe(TaskStatus.PENDING);
    });

    it('fails a pro-only retry up front when no pro wizard is configured', async () => {
      const basicService = await buildService(undefined);

      const rerun = await basicService.applyRerun(plan());

      expect(rerun.status).toBe(TaskStatus.ERROR);
      expect(rerun.exception?.type).toBe('UnsupportedFunctionError');
    });
  });
});
