import { memberDisplayNamesFromRows } from './member-display-names';

describe('namespace display names', () => {
  const row = (overrides = {}) => ({
    id: '1',
    userId: 'u1',
    nickname: 'Nick',
    username: 'account',
    deletedAt: null,
    userDeletedAt: null,
    displayNameSnapshot: null,
    ...overrides,
  });

  it('uses the active namespace nickname and current username', () => {
    expect(memberDisplayNamesFromRows([row()])).toEqual({
      u1: 'Nick（account）',
    });
    expect(
      memberDisplayNamesFromRows([row({ nickname: ' account ' })]),
    ).toEqual({ u1: 'account' });
    expect(memberDisplayNamesFromRows([row({ nickname: null })])).toEqual({
      u1: 'account',
    });
  });

  it('freezes departed members even after their global username changes', () => {
    expect(
      memberDisplayNamesFromRows([
        row({
          deletedAt: new Date(),
          username: 'new',
          displayNameSnapshot: 'Last（old）',
        }),
      ]),
    ).toEqual({ u1: 'Last（old）' });
  });

  it('uses the most recent departure and resumes current names after rejoining', () => {
    const old = row({
      id: '2',
      deletedAt: new Date('2026-01-01'),
      displayNameSnapshot: 'Old',
    });
    const recent = row({
      id: '3',
      deletedAt: new Date('2026-02-01'),
      displayNameSnapshot: 'Recent',
    });
    expect(memberDisplayNamesFromRows([old, recent])).toEqual({ u1: 'Recent' });
    expect(memberDisplayNamesFromRows([recent, row(), old])).toEqual({
      u1: 'Nick（account）',
    });
  });

  it('does not reconstruct historical usernames from current accounts', () => {
    expect(
      memberDisplayNamesFromRows([row({ deletedAt: new Date() })]),
    ).toEqual({ u1: 'Nick' });
    expect(
      memberDisplayNamesFromRows([
        row({ deletedAt: new Date(), nickname: null }),
      ]),
    ).toEqual({});
  });

  it('uses the frozen identity when the account is soft deleted', () => {
    expect(
      memberDisplayNamesFromRows([
        row({ userDeletedAt: new Date(), displayNameSnapshot: 'Frozen' }),
      ]),
    ).toEqual({ u1: 'Frozen' });
  });
});

import { User } from 'omniboxd/user/entities/user.entity';
import { IsNull } from 'typeorm';

import { NamespaceMember } from './entities/namespace-member.entity';
import { freezeMemberDisplayNames } from './member-display-names';

it('locks the current user before memberships and snapshots only active rows', async () => {
  const order: string[] = [];
  const manager = {
    findOne: jest.fn().mockImplementation((entity) => {
      expect(entity).toBe(User);
      order.push('user');
      return Promise.resolve({ username: 'Latest' });
    }),
    find: jest.fn().mockImplementation(() => {
      order.push('members');
      return Promise.resolve([{ id: '1', userId: 'u1', nickname: 'Nick' }]);
    }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  await freezeMemberDisplayNames(manager as never, 'u1', 'space');
  expect(order).toEqual(['user', 'members']);
  expect(manager.find).toHaveBeenCalledWith(
    NamespaceMember,
    expect.objectContaining({
      where: { userId: 'u1', namespaceId: 'space', deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    }),
  );
  expect(manager.update).toHaveBeenCalledWith(
    NamespaceMember,
    { id: '1', deletedAt: IsNull() },
    { displayNameSnapshot: 'Nick（Latest）' },
  );
});
