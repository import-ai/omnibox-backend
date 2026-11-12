import type { ConfigService } from '@nestjs/config';
import type { Task } from 'omniboxd/tasks/tasks.entity';
import type { TraceService } from 'omniboxd/trace/trace.service';
import type { Repository } from 'typeorm';

import { BehaviorService } from './behavior.service';
import type { BehaviorAction } from './behavior-action.entity';

it('retries durable outcomes with stable IDs and original initiation, without an API/business retry', async () => {
  const row = {
    id: 'action',
    userId: 'user',
    actionType: 'resource_add',
    startedAt: new Date('2026-11-10T15:59:00Z'),
    resultAt: new Date('2026-11-10T16:01:00Z'),
    originPlatform: 'ios',
    status: 'success',
  };
  const actions = {
    find: jest.fn(() => Promise.resolve([row])),
    update: jest.fn(() => Promise.resolve({})),
  };
  const trace = {
    emitTraceEvents: jest
      .fn()
      .mockRejectedValueOnce(new Error('Kafka'))
      .mockResolvedValue(undefined),
  };
  const service = new BehaviorService(
    actions as unknown as Repository<BehaviorAction>,
    trace as unknown as TraceService,
    { get: () => 'topic' } as unknown as ConfigService,
    {} as Repository<Task>,
  );
  jest.spyOn(service, 'reconcile').mockResolvedValue();
  jest.spyOn(service, 'reconcileAnswers').mockResolvedValue();
  await expect(service.deliver()).rejects.toThrow('Kafka');
  expect(actions.update).not.toHaveBeenCalled();
  await service.deliver();
  expect(trace.emitTraceEvents.mock.calls[0]).toEqual(
    trace.emitTraceEvents.mock.calls[1],
  );
  expect(trace.emitTraceEvents.mock.calls[1][0][1].props).toMatchObject({
    event_id: 'action:result:success',
    action_started_at: '2026-11-10T15:59:00.000Z',
    occurred_at: '2026-11-10T16:01:00.000Z',
  });
  expect(actions.update).toHaveBeenCalledTimes(1);
});

it('waits for parse post-processing and allows a successful retry to supersede its failed ancestor', async () => {
  const row = { id: 'action', userId: 'user' };
  const taskRows = [
    { id: 'old', status: 'error', retriedFromTaskId: null, payload: {} },
    {
      id: 'retry',
      status: 'finished',
      retriedFromTaskId: 'old',
      payload: { behavior_postprocessed: false, behavior_parse_success: true },
    },
  ];
  const actionQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([row]),
  };
  const taskQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(taskRows),
  };
  const service = new BehaviorService(
    {
      createQueryBuilder: () => actionQuery,
      update: jest.fn().mockResolvedValue({}),
    } as unknown as Repository<BehaviorAction>,
    {} as TraceService,
    {} as ConfigService,
    { createQueryBuilder: () => taskQuery } as unknown as Repository<Task>,
  );
  const result = jest.spyOn(service, 'result').mockResolvedValue();
  await service.reconcile();
  expect(result).not.toHaveBeenCalled();
  taskRows[1].payload.behavior_postprocessed = true;
  await service.reconcile();
  expect(result).toHaveBeenCalledWith(
    { action_id: 'action', user_id: 'user' },
    'success',
  );
  result.mockClear();
  taskRows[1].payload.behavior_parse_success = false;
  await service.reconcile();
  expect(result).toHaveBeenCalledWith(
    { action_id: 'action', user_id: 'user' },
    'failed',
  );
});
