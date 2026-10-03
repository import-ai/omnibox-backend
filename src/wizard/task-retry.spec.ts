import { TaskStatus } from '../tasks/tasks.entity';
import { TasksService } from '../tasks/tasks.service';
import { WizardService } from './wizard.service';

function setup(overrides = {}, affected = 1) {
  const task: any = {
    id: 't',
    namespaceId: 'n',
    function: 'update_memory',
    status: TaskStatus.RUNNING,
    workerId: 'owner',
    numSchedules: 1,
    startedAt: new Date(0),
    createdAt: new Date(0),
    canceledAt: null,
    ...overrides,
  };
  const repo = {
    findOneOrFail: jest.fn().mockResolvedValue({ ...task }),
    update: jest.fn().mockResolvedValue({ affected }),
  };
  const service: any = Object.create(WizardService.prototype);
  service.logger = { warn: jest.fn(), debug: jest.fn() };
  service.wizardTaskService = { taskRepository: repo };
  service.tasksService = {
    canRetry: (t: any, e: any) =>
      TasksService.prototype.canRetry.call({ maxRetries: 3 }, t, e),
    callTaskHook: jest.fn(),
  };
  service.postprocess = jest.fn().mockResolvedValue({});
  return { service, repo };
}
const callback: any = {
  id: 't',
  workerId: 'owner',
  status: TaskStatus.ERROR,
  exception: { retryable: true },
};
it('requeues retryable memory with a running-owner atomic predicate and clears lease', async () => {
  const { service, repo } = setup();
  expect(await service.taskDoneCallback(callback)).toMatchObject({
    requeued: true,
  });
  expect(repo.update).toHaveBeenCalledWith(
    { id: 't', status: TaskStatus.RUNNING, workerId: 'owner' },
    expect.objectContaining({
      status: TaskStatus.PENDING,
      workerId: null,
      lastHeartbeat: null,
      startedAt: null,
      endedAt: null,
    }),
  );
  expect(service.postprocess).not.toHaveBeenCalled();
});
it.each([{ workerId: 'new-owner' }, { status: TaskStatus.PENDING }])(
  'rejects stale callbacks before persistence',
  async (overrides) => {
    const { service, repo } = setup(overrides);
    await service.taskDoneCallback(callback);
    expect(repo.update).not.toHaveBeenCalled();
  },
);
it('does not claim requeue if ownership changes at write time', async () => {
  const { service } = setup({}, 0);
  expect(await service.taskDoneCallback(callback)).toMatchObject({
    requeued: false,
  });
});
it.each([{ numSchedules: 4 }, { canceledAt: new Date() }])(
  'retains failure at retry boundary',
  async (overrides) => {
    const { service, repo } = setup(overrides);
    await service.taskDoneCallback(callback);
    expect(repo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: TaskStatus.ERROR }),
    );
  },
);
