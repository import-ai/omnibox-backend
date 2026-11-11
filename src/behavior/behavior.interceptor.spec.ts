import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, of } from 'rxjs';

import {
  BehaviorInterceptor,
  readBehaviorContext,
} from './behavior.interceptor';
import { BehaviorService } from './behavior.service';
import { behaviorContext } from './behavior-context';

const now = Date.parse('2026-11-11T00:01:00Z');
const headers = {
  'x-omnibox-action-id': '7cfa8e55-7a81-4125-9e1f-446b4b2d069f',
  'x-omnibox-action-started-at': '2026-11-10T15:59:00Z',
  'x-client-platform': 'web',
};
function request(extra = {}) {
  return {
    method: 'POST',
    originalUrl: '/api/v1/namespaces/ns/resources',
    body: {},
    user: { id: 'user' },
    header: (key: string) => headers[key],
    ...extra,
  } as unknown as Request;
}
it('uses authenticated identity, validates platform/time/UUID, and preserves initiation across midnight', () => {
  expect(readBehaviorContext(request(), now)).toMatchObject({
    user_id: 'user',
    action_started_at: '2026-11-10T15:59:00.000Z',
  });
  expect(
    readBehaviorContext(request({ user: undefined }), now),
  ).toBeUndefined();
  expect(
    readBehaviorContext(request({ header: () => 'bad' }), now),
  ).toBeUndefined();
  expect(readBehaviorContext(request(), now + 8 * 86_400_000)).toBeUndefined();
  expect(readBehaviorContext(request(), now - 86_400_000)).toBeUndefined();
});
function fixture() {
  const behavior = {
    enabled: () => true,
    begin: jest.fn(() => Promise.resolve(true)),
    bind: jest.fn(async () => {}),
    result: jest.fn(async () => {}),
  };
  const req = request({
    header: (key: string) =>
      key === 'x-omnibox-action-started-at'
        ? new Date().toISOString()
        : headers[key],
  });
  const execution = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
  const interceptor = new BehaviorInterceptor(
    behavior as unknown as BehaviorService,
  );
  return { behavior, execution, interceptor };
}
it('never invokes a business handler twice when it throws synchronously', async () => {
  const f = fixture();
  const handle = jest.fn(() => {
    throw new Error('business');
  });
  await expect(
    firstValueFrom(f.interceptor.intercept(f.execution, { handle })),
  ).rejects.toThrow('business');
  expect(handle).toHaveBeenCalledTimes(1);
});
it('fails open when the ledger is unavailable without replaying the product request', async () => {
  const f = fixture();
  f.behavior.begin.mockRejectedValueOnce(new Error('database'));
  const handle = jest.fn(() => of({ id: 'resource' }));
  await expect(
    firstValueFrom(f.interceptor.intercept(f.execution, { handle })),
  ).resolves.toEqual({ id: 'resource' });
  expect(handle).toHaveBeenCalledTimes(1);
  expect(f.behavior.result).not.toHaveBeenCalled();
});
it('carries action context into asynchronous parsing and does not declare queued work successful', async () => {
  const f = fixture();
  const handle = jest.fn(() => {
    behaviorContext.getStore()!.task_ids.push('task');
    return of({ id: 'resource' });
  });
  await firstValueFrom(f.interceptor.intercept(f.execution, { handle }));
  await Promise.resolve();
  expect(f.behavior.bind).toHaveBeenCalled();
  expect(f.behavior.result).not.toHaveBeenCalled();
});
