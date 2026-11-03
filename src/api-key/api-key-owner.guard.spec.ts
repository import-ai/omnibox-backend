import { ExecutionContext } from '@nestjs/common';

import { APIKeyOwnerGuard } from './api-key-owner.guard';

const service = { findOne: jest.fn() };
const guard = new APIKeyOwnerGuard(
  service as never,
  { t: (key: string) => key } as never,
);
const context = (request: object) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as ExecutionContext;

beforeEach(() => jest.clearAllMocks());

it('rejects creating a combined key for a different user', async () => {
  await expect(
    guard.canActivate(
      context({
        method: 'POST',
        user: { id: 'caller' },
        body: { user_id: 'other' },
      }),
    ),
  ).rejects.toThrow();
});
it('rejects listing another user keys', async () => {
  await expect(
    guard.canActivate(
      context({
        method: 'GET',
        user: { id: 'caller' },
        query: { user_id: 'other' },
      }),
    ),
  ).rejects.toThrow();
});
it.each(['GET', 'PUT', 'PATCH', 'DELETE'])(
  'rejects %s for another user key',
  async (method) => {
    service.findOne.mockResolvedValue({ user_id: 'other' });
    await expect(
      guard.canActivate(
        context({ method, user: { id: 'caller' }, params: { id: 'key' } }),
      ),
    ).rejects.toThrow();
  },
);
it('allows the owner to update scope', async () => {
  service.findOne.mockResolvedValue({ user_id: 'caller' });
  await expect(
    guard.canActivate(
      context({
        method: 'PATCH',
        user: { id: 'caller' },
        params: { id: 'key' },
      }),
    ),
  ).resolves.toBe(true);
});
it('allows listing within the caller namespace without a user query', async () => {
  await expect(
    guard.canActivate(
      context({
        method: 'GET',
        user: { id: 'caller' },
        query: { namespace_id: 'ns' },
      }),
    ),
  ).resolves.toBe(true);
});
