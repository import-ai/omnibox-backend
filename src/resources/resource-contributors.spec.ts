import {
  contributorInitial,
  contributorLabel,
  contributorTone,
  formerContributorLabel,
  historicalMemberDisplayName,
  sameStringSet,
} from './resource-contributors';

describe('contributorLabel', () => {
  it('shows nickname with username when they differ', () => {
    expect(contributorLabel({ nickname: '荔枝', username: 'lizhi' })).toBe(
      '荔枝（lizhi）',
    );
  });

  it('uses username when nickname is missing or identical', () => {
    expect(contributorLabel({ username: 'lizhi' })).toBe('lizhi');
    expect(contributorLabel({ nickname: 'lizhi', username: 'lizhi' })).toBe(
      'lizhi',
    );
  });

  it('falls back to email then user id', () => {
    expect(contributorLabel({ email: 'a@example.com' })).toBe('a@example.com');
    expect(contributorLabel({ userId: 'user-1' })).toBe('user-1');
  });
});

describe('contributorInitial', () => {
  it('uses the first unicode character', () => {
    expect(contributorInitial('荔枝（lizhi）')).toBe('荔');
    expect(contributorInitial('')).toBe('?');
  });
});

describe('contributorTone', () => {
  it('stays inside the four comment avatar tones', () => {
    expect(['0', '1', '2', '3']).toContain(contributorTone('user-1'));
    expect(contributorTone('user-1')).toBe(contributorTone('user-1'));
  });
});

describe('sameStringSet', () => {
  it('treats a missing update as unchanged and ignores order', () => {
    expect(sameStringSet(undefined, ['b'])).toBe(true);
    expect(sameStringSet(['b', 'a'], ['a', 'b'])).toBe(true);
    expect(sameStringSet(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('formerContributorLabel', () => {
  it('keeps a historical membership snapshot ahead of a later username', () => {
    expect(
      historicalMemberDisplayName([
        {
          deletedAt: new Date('2026-01-01T00:00:00Z'),
          displayNameSnapshot: '旧名（old）',
        },
        {
          deletedAt: new Date('2026-02-01T00:00:00Z'),
          displayNameSnapshot: '离开时（left）',
        },
      ]),
    ).toBe('离开时（left）');
    expect(
      formerContributorLabel({
        historicalName: '离开时（left）',
        username: 'renamed',
        userId: 'user-1',
      }),
    ).toBe('离开时（left）');
  });

  it('uses this feature snapshot only when no historical membership name exists', () => {
    expect(
      formerContributorLabel({
        frozenLabel: '冻结（frozen）',
        username: 'renamed',
      }),
    ).toBe('冻结（frozen）');
  });
});
