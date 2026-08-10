import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { S3Service } from 'omniboxd/s3/s3.service';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { TasksService } from 'omniboxd/tasks/tasks.service';

describe('TasksService.rerunTask', () => {
  let service: TasksService;
  let taskRepository: { findOne: jest.Mock };

  const task = (overrides: Partial<Task>): Task =>
    ({
      id: 'task-1',
      namespaceId: 'namespace-1',
      userId: 'user-1',
      priority: '5',
      function: 'file_reader_pdf',
      input: { resource_id: 'resource-1' },
      payload: { resource_id: 'resource-1' },
      status: TaskStatus.FINISHED,
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Task;

  beforeEach(async () => {
    taskRepository = { findOne: jest.fn() };

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
        { provide: S3Service, useValue: {} },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  it.each([
    TaskStatus.CANCELED,
    TaskStatus.ERROR,
    TaskStatus.TIMEOUT,
    TaskStatus.INSUFFICIENT_QUOTA,
  ])('reruns a %s task with the original input', async (status) => {
    const original = task({ status });
    taskRepository.findOne.mockResolvedValue(original);
    const emitTask = jest
      .spyOn(service, 'emitTask')
      .mockResolvedValue(task({ id: 'task-2', status: TaskStatus.PENDING }));

    const rerun = await service.rerunTask('task-1');

    expect(rerun.id).toBe('task-2');
    expect(emitTask).toHaveBeenCalledWith({
      namespaceId: original.namespaceId,
      userId: original.userId,
      priority: original.priority,
      function: original.function,
      input: original.input,
      payload: original.payload,
    });
  });

  it.each([TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.FINISHED])(
    'refuses to rerun a %s task',
    async (status) => {
      taskRepository.findOne.mockResolvedValue(task({ status }));
      const emitTask = jest.spyOn(service, 'emitTask');

      await expect(service.rerunTask('task-1')).rejects.toMatchObject({
        code: 'CAN_ONLY_RERUN_FAILED_OR_CANCELED',
      });
      expect(emitTask).not.toHaveBeenCalled();
    },
  );
});
