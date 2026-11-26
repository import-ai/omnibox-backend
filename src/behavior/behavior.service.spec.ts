import type { ConfigService } from '@nestjs/config';
import type { Task } from 'omniboxd/tasks/tasks.entity';
import type { TraceService } from 'omniboxd/trace/trace.service';
import type { Repository } from 'typeorm';

import { BehaviorService } from './behavior.service';
import type { BehaviorAction } from './behavior-action.entity';
import type { BehaviorContext } from './behavior-context';

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

describe('conversation action terminal outcomes', () => {
  function serviceWithAction(action: {
    id: string;
    userId: string;
    actionType: string;
    status: string;
    resultAt?: Date | null;
    emittedAt?: Date | null;
  }) {
    const actions = {
      findOneBy: jest.fn(() =>
        Promise.resolve({ ...action, startedAt: new Date(1) }),
      ),
      update: jest.fn(
        (
          criteria: { id?: string; userId?: string; status?: unknown },
          patch: Record<string, unknown>,
        ) => {
          if (
            criteria.id === action.id &&
            criteria.userId === action.userId &&
            (criteria.status === undefined ||
              (typeof criteria.status === 'string' &&
                action.status === criteria.status))
          ) {
            Object.assign(action, patch);
          }
          return Promise.resolve({});
        },
      ),
      query: jest.fn(),
    };
    const insert = {
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };
    (actions as Record<string, unknown>).createQueryBuilder = () => ({
      insert: () => insert,
    });
    const config = {
      get: (key: string) =>
        key === 'OBB_TRACE_TOPIC'
          ? 'topic'
          : key === 'OBB_NON_BUTTON_TRACKING_ENABLED'
            ? 'true'
            : undefined,
    };
    const service = new BehaviorService(
      actions as unknown as Repository<BehaviorAction>,
      {} as TraceService,
      config as unknown as ConfigService,
      {} as Repository<Task>,
    );
    jest.spyOn(service, 'deliver').mockResolvedValue();
    return { service, actions, action };
  }

  it('accepts an outcome only while the conversation action is pending', async () => {
    const settled = serviceWithAction({
      id: 'action',
      userId: 'user',
      actionType: 'ai_conversation',
      status: 'failed',
    });
    await settled.service.result(
      { action_id: 'action', user_id: 'user' } as any,
      'success',
    );
    expect(settled.actions.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
      expect.objectContaining({ status: 'success' }),
    );
    expect(settled.action.status).toBe('failed');

    const success = serviceWithAction({
      id: 'action',
      userId: 'user',
      actionType: 'ai_conversation',
      status: 'success',
    });
    await success.service.result(
      { action_id: 'action', user_id: 'user' } as any,
      'cancelled',
    );
    expect(success.action.status).toBe('success');

    const pending = serviceWithAction({
      id: 'action',
      userId: 'user',
      actionType: 'ai_conversation',
      status: 'pending',
    });
    await pending.service.result(
      { action_id: 'action', user_id: 'user' } as any,
      'success',
    );
    expect(pending.action.status).toBe('success');
  });

  it('reopens a failed action only when the same frozen action retries', async () => {
    const retried = serviceWithAction({
      id: 'action',
      userId: 'user',
      actionType: 'ai_conversation',
      status: 'failed',
    });
    const context: BehaviorContext = {
      action_id: 'action',
      action_type: 'ai_conversation',
      action_started_at: new Date(1).toISOString(),
      origin_platform: 'ios',
      user_id: 'user',
      task_ids: [],
    };
    expect(await retried.service.begin(context)).toBe(true);
    expect(context.reopened).toBe(true);
    await retried.service.result(context as any, 'success');
    expect(retried.action.status).toBe('success');

    // A synthesized/stale context (no reopened flag, as the paused-ancestor
    // collector builds) cannot flip a settled failed action.
    const stale = serviceWithAction({
      id: 'action',
      userId: 'user',
      actionType: 'ai_conversation',
      status: 'failed',
    });
    await stale.service.result(
      { action_id: 'action', user_id: 'user' } as any,
      'success',
    );
    expect(stale.action.status).toBe('failed');

    // Cancelled/stopped stay terminal even for a reopened retry context.
    const cancelled = serviceWithAction({
      id: 'action',
      userId: 'user',
      actionType: 'ai_conversation',
      status: 'cancelled',
    });
    await cancelled.service.result(
      {
        action_id: 'action',
        user_id: 'user',
        action_type: 'ai_conversation',
        reopened: true,
      } as any,
      'success',
    );
    expect(cancelled.action.status).toBe('cancelled');
  });

  it('does not let reconcileAnswers upgrade a settled conversation action', async () => {
    const failed = serviceWithAction({
      id: 'action',
      userId: 'user',
      actionType: 'ai_conversation',
      status: 'failed',
    });
    failed.actions.query.mockResolvedValue([
      {
        id: 'action',
        user_id: 'user',
        status: 'complete',
        completed_at: '2026-11-25T13:00:00.000Z',
      },
    ]);
    await failed.service.reconcileAnswers();
    expect(failed.action.status).toBe('failed');
    expect(failed.actions.update).toHaveBeenCalledTimes(1);
    expect(failed.actions.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
      expect.objectContaining({ status: 'success' }),
    );

    const pending = serviceWithAction({
      id: 'action',
      userId: 'user',
      actionType: 'ai_conversation',
      status: 'pending',
    });
    pending.actions.query.mockResolvedValue([
      {
        id: 'action',
        user_id: 'user',
        status: 'complete',
        completed_at: '2026-11-25T13:00:00.000Z',
      },
    ]);
    await pending.service.reconcileAnswers();
    expect(pending.action.status).toBe('success');
  });
});
