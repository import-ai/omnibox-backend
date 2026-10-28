import {
  contributorInitial,
  contributorLabel,
  contributorTone,
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
