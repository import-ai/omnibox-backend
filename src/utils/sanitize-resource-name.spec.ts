import generateId from './generate-id';
import {
  generateUniqueResourceName,
  randomResourceNameSuffix,
  sanitizeResourceName,
} from './sanitize-resource-name';

jest.mock('./generate-id', () => {
  const actual = jest.requireActual('./generate-id');
  return {
    __esModule: true,
    default: jest.fn(actual.default),
  };
});

const mockedGenerateId = generateId as jest.MockedFunction<typeof generateId>;

describe('sanitizeResourceName', () => {
  it('replaces slashes with underscores', () => {
    expect(sanitizeResourceName('a/b/c')).toBe('a_b_c');
  });

  it('returns empty values unchanged', () => {
    expect(sanitizeResourceName(undefined)).toBeUndefined();
    expect(sanitizeResourceName('')).toBe('');
  });
});

describe('randomResourceNameSuffix', () => {
  it('matches _[A-Za-z0-9]{4}', () => {
    for (let i = 0; i < 20; i++) {
      expect(randomResourceNameSuffix()).toMatch(/^_[A-Za-z0-9]{4}$/);
    }
  });
});

describe('generateUniqueResourceName', () => {
  afterEach(() => {
    mockedGenerateId.mockImplementation(
      jest.requireActual('./generate-id').default,
    );
  });

  it('returns the original name when it is unique', () => {
    expect(generateUniqueResourceName('得到听书', () => false)).toBe(
      '得到听书',
    );
  });

  it('appends _[A-Za-z0-9]{4} to the original name on conflict', () => {
    mockedGenerateId.mockReturnValueOnce('aB3x');
    const taken = new Set(['得到听书']);
    const name = generateUniqueResourceName('得到听书', (candidate) =>
      taken.has(candidate),
    );
    expect(name).toBe('得到听书_aB3x');
  });

  it('retries from the original name instead of chaining suffixes', () => {
    mockedGenerateId.mockReturnValueOnce('aaaa').mockReturnValueOnce('bbbb');
    const taken = new Set(['doc', 'doc_aaaa']);
    const name = generateUniqueResourceName('doc', (candidate) =>
      taken.has(candidate),
    );
    expect(name).toBe('doc_bbbb');
  });

  it('throws after maxAttempts', () => {
    expect(() => generateUniqueResourceName('doc', () => true, 3)).toThrow(
      'Failed to generate unique name after 3 attempts',
    );
  });

  it('supports async uniqueness checks', async () => {
    mockedGenerateId.mockReturnValueOnce('xy9Z');
    const taken = new Set(['doc']);
    await expect(
      generateUniqueResourceName('doc', (candidate) =>
        Promise.resolve(taken.has(candidate)),
      ),
    ).resolves.toBe('doc_xy9Z');
  });
});
