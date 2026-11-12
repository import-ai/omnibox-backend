/* eslint-disable @typescript-eslint/require-await -- Async transaction test doubles. */
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';

import { WizardService } from './wizard.service';

function fixture(failDispatch: boolean, trackBehavior = false) {
  let task: Task = Object.assign(new Task(), {
    id: 'delivery',
    namespaceId: 'ns',
    status: TaskStatus.FINISHED,
    function: 'file_reader_pdf',
    output: { markdown: 'Delivered document' },
    payload: {
      ...(trackBehavior
        ? { behavior_context: { action_id: 'action', user_id: 'user' } }
        : {}),
      delivery_pending: true,
      delivery_next_tasks: [{ function: 'index', input: {} }],
    },
  });
  let delivered = false;
  const repo = {
    findOneByOrFail: jest.fn(async () => structuredClone(task)),
    manager: {} as any,
  };
  repo.manager.transaction = async (
    run: (manager: any) => Promise<unknown>,
  ) => {
    let staged = structuredClone(task);
    let stagedBody = delivered;
    const manager = {
      query: jest.fn(async () => [{ locked: true }]),
      getRepository: () => ({
        findOneByOrFail: async () => structuredClone(staged),
      }),
      save: async (value: Task) => {
        staged = structuredClone(value);
      },
      writeBody: () => {
        stagedBody = true;
      },
    };
    const result = await run(manager);
    task = staged;
    delivered = stagedBody;
    return result;
  };
  const hook = jest.fn();
  const service = new WizardService(
    { taskRepository: repo } as any,
    { callTaskHook: hook } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { t: jest.fn() } as any,
    { get: () => 'http://localhost' } as any,
  );
  const postprocess = jest
    .spyOn(service, 'postprocess')
    .mockImplementation(async (_task, tx) => {
      expect(tx).toBeDefined();
      (tx!.entityManager as any).writeBody();
      return {};
    });
  jest
    .spyOn(service as any, 'dispatchNextTasks')
    .mockImplementation(async () => {
      if (failDispatch) throw new Error('Child insert failed');
    });
  return { service, hook, postprocess, state: () => ({ task, delivered }) };
}

test('failed child dispatch rolls back content, including after the terminal retry', async () => {
  const f = fixture(true);
  for (let attempt = 0; attempt < 5; attempt++) {
    await expect((f.service as any).deliverTask('delivery')).rejects.toThrow(
      'Child insert failed',
    );
    expect(f.state().delivered).toBe(false);
    expect(f.state().task.payload!.credits_delivered).not.toBe(true);
  }
  expect(f.state().task.status).toBe(TaskStatus.ERROR);
  expect(f.state().task.payload!.delivery_pending).toBe(false);
  expect(f.hook).toHaveBeenCalledWith('ns', 'delivery');
});

test('successful delivery commits content and billing marker once', async () => {
  const f = fixture(false);
  await (f.service as any).deliverTask('delivery');
  await (f.service as any).deliverTask('delivery');
  expect(f.state().delivered).toBe(true);
  expect(f.state().task.payload!.credits_delivered).toBe(true);
  expect(f.postprocess).toHaveBeenCalledTimes(1);
});

test('commits behavior success with content delivery, including idempotent replay', async () => {
  const f = fixture(false, true);
  f.postprocess.mockImplementation(async (_task, tx) => {
    (tx!.entityManager as any).writeBody();
    return { resourceId: 'resource' };
  });
  await (f.service as any).deliverTask('delivery');
  await (f.service as any).deliverTask('delivery');
  expect(f.state().task.payload).toMatchObject({
    credits_delivered: true,
    delivery_pending: false,
    behavior_postprocessed: true,
    behavior_parse_success: true,
  });
  expect(f.postprocess).toHaveBeenCalledTimes(1);
});

test('rolls back behavior success when child dispatch fails', async () => {
  const f = fixture(true, true);
  f.postprocess.mockImplementation(async (_task, tx) => {
    (tx!.entityManager as any).writeBody();
    return { resourceId: 'resource' };
  });
  await expect((f.service as any).deliverTask('delivery')).rejects.toThrow(
    'Child insert failed',
  );
  expect(f.state().delivered).toBe(false);
  expect(f.state().task.payload!.behavior_postprocessed).not.toBe(true);
  expect(f.state().task.payload!.behavior_parse_success).not.toBe(true);
  expect(f.state().task.payload!.delivery_pending).toBe(true);
});

test('does not report parsing success without a delivered resource', async () => {
  const f = fixture(false, true);
  await (f.service as any).deliverTask('delivery');
  expect(f.state().task.payload).toMatchObject({
    behavior_postprocessed: true,
    behavior_parse_success: false,
  });
});

test('dispatches parse children with the original action context inside the delivery transaction', async () => {
  const emitTask = jest.fn(async () => ({ id: 'child' }));
  const service = Object.create(WizardService.prototype) as WizardService;
  Object.assign(service, {
    tasksService: { emitTask },
    logger: { debug: jest.fn() },
  });
  const action = {
    action_id: 'action',
    action_started_at: '2026-11-11T15:59:00Z',
    user_id: 'user',
  };
  const parent = Object.assign(new Task(), {
    id: 'parent',
    namespaceId: 'ns',
    userId: 'user',
    priority: '5',
    payload: { behavior_context: action },
  });
  const tx = { entityManager: {} };
  await (service as any).dispatchNextTasks(
    parent,
    [
      { function: 'file_reader_pdf', input: {} },
      { function: 'index', input: {} },
    ],
    tx,
  );
  expect(emitTask).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      payload: { parent_task_id: 'parent', behavior_context: action },
    }),
    tx,
  );
  expect(emitTask).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      payload: { parent_task_id: 'parent' },
    }),
    tx,
  );
});
