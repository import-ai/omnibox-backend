import { HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

import { DocType } from './doc-type.enum';
import { IndexedResourceDto } from './dto/indexed-doc.dto';
import {
  paginateSearch,
  paginateV1,
  paginateV2,
  sessionFingerprint,
  sessionOwner,
  SessionRunner,
  V1PageRequest,
} from './search-session.adapters';
import { SearchSessionError } from './search-session.store';
import { SessionResult } from './search-session.types';

const i18n = {
  t: jest.fn(
    (key: string, options: { args: { status: number } }) =>
      `${key}:${options.args.status}`,
  ),
} as any;

const item = (resourceId: string): IndexedResourceDto => ({
  type: DocType.RESOURCE,
  id: 'record-' + resourceId,
  resourceId,
  title: resourceId,
  content: 'text',
  attrs: {},
  resourceType: ResourceType.DOC,
  readOnly: false,
});

const sessionResult = (
  overrides: Partial<SessionResult> = {},
): SessionResult => ({
  items: [],
  total: 0,
  confirmedCount: 0,
  nextOffset: 0,
  hasMore: false,
  status: 'complete',
  recallTruncated: false,
  ...overrides,
});

const engineWith = (value: SessionResult | Error) =>
  ({
    run: jest.fn(() =>
      value instanceof Error ? Promise.reject(value) : Promise.resolve(value),
    ),
  }) as SessionRunner & { run: jest.Mock };

const v1Request = (overrides: Partial<V1PageRequest> = {}): V1PageRequest => ({
  userId: 'u',
  namespaceId: 'n',
  query: 'q',
  resourceIds: null,
  offset: 0,
  limit: 20,
  ...overrides,
});

const rejection = async (promise: Promise<unknown>): Promise<AppException> => {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('expected the promise to reject');
};

describe('paginateV2', () => {
  it('requires a request id before touching the engine', async () => {
    const engine = engineWith(sessionResult());
    const error = await rejection(paginateV2(engine, i18n, v1Request() as any));
    expect(error.getResponse().code).toBe('search_request_required');
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(engine.run).not.toHaveBeenCalled();
  });

  it('derives a stable session id from the owner and request id', async () => {
    const engine = engineWith(sessionResult());
    await paginateV2(engine, i18n, { ...v1Request(), requestId: 'r' });
    await paginateV2(engine, i18n, { ...v1Request(), requestId: 'r' });
    await paginateV2(engine, i18n, {
      ...v1Request({ userId: 'other' }),
      requestId: 'r',
    });
    const [first, second, other] = engine.run.mock.calls.map(
      ([params]) => params,
    );
    expect(first.sessionId).toBe(second.sessionId);
    expect(other.sessionId).not.toBe(first.sessionId);
    expect(first).toMatchObject({
      owner: sessionOwner('u', 'n'),
      requestId: 'r',
      createIfMissing: true,
    });
    expect(other.owner).toBe(sessionOwner('other', 'n'));
  });

  it('treats an explicit search id as a session that must already exist', async () => {
    const engine = engineWith(sessionResult());
    const page = await paginateV2(engine, i18n, {
      ...v1Request(),
      searchId: 'search-1',
      requestId: 'r',
    });
    expect(page.searchId).toBe('search-1');
    expect(engine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'search-1',
        createIfMissing: false,
        requestId: 'r',
      }),
    );
  });

  it('passes the envelope through unchanged for partial pages', async () => {
    const engine = engineWith(
      sessionResult({
        items: [item('a')],
        total: null,
        confirmedCount: 5,
        nextOffset: 20,
        hasMore: true,
        status: 'partial',
        recallTruncated: true,
      }),
    );
    const page = await paginateV2(engine, i18n, {
      ...v1Request(),
      requestId: 'r',
    });
    expect(page).toEqual({
      items: [item('a')],
      offset: 0,
      limit: 20,
      searchId: expect.any(String),
      nextOffset: 20,
      hasMore: true,
      total: null,
      status: 'partial',
      recallTruncated: true,
    });
  });

  it.each([
    ['SEARCH_SESSION_EXPIRED', 410],
    ['SEARCH_SESSION_INVALIDATED', 409],
    ['SEARCH_CAPACITY', 429],
  ])('maps %s without changing its wire code', async (code, status) => {
    const engine = engineWith(new SearchSessionError(code, status));
    const error = await rejection(
      paginateV2(engine, i18n, { ...v1Request(), requestId: 'r' }),
    );
    expect(error.getResponse().code).toBe(code.toLowerCase());
    expect(error.getStatus()).toBe(status);
    expect(error.message).toBe(`system.errors.requestFailed:${status}`);
  });

  it('maps unknown failures to an unavailable search', async () => {
    const engine = engineWith(new Error('boom'));
    const error = await rejection(
      paginateV2(engine, i18n, { ...v1Request(), requestId: 'r' }),
    );
    expect(error.getResponse().code).toBe('search_unavailable');
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('rethrows application exceptions unchanged', async () => {
    const original = new AppException('message', 'CUSTOM', HttpStatus.CONFLICT);
    const engine = engineWith(original);
    const error = await rejection(
      paginateV2(engine, i18n, { ...v1Request(), requestId: 'r' }),
    );
    expect(error).toBe(original);
  });
});

describe('paginateV1', () => {
  it('uses the implicit deterministic session and ignores request ids', async () => {
    const engine = engineWith(sessionResult({ items: [item('a')], total: 1 }));
    const fingerprint = sessionFingerprint('u', 'n', 'q', null);
    const page = await paginateV1(engine, i18n, {
      ...v1Request(),
      searchId: 'ignored',
      requestId: 'ignored',
    } as any);
    expect(page).toEqual({
      items: [item('a')],
      total: 1,
      offset: 0,
      limit: 20,
    });
    expect(engine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: sessionOwner('u', 'n'),
        fingerprint,
        sessionId: 'v1-' + fingerprint,
        createIfMissing: true,
      }),
    );
    expect(engine.run.mock.calls[0][0].requestId).toBeUndefined();
  });

  it('short-circuits an empty filter candidate set without a session', async () => {
    const engine = engineWith(sessionResult());
    const page = await paginateV1(engine, i18n, {
      ...v1Request({ resourceIds: [] }),
    });
    expect(page).toEqual({ items: [], total: 0, offset: 0, limit: 20 });
    expect(engine.run).not.toHaveBeenCalled();
  });

  it('returns the engine numeric total for complete results', async () => {
    const engine = engineWith(
      sessionResult({ items: [item('a')], total: 0, confirmedCount: 0 }),
    );
    await expect(
      paginateV1(engine, i18n, v1Request({ resourceIds: ['a'] })),
    ).resolves.toMatchObject({ total: 0 });
  });

  it('returns a numeric lower bound for partial results', async () => {
    const engine = engineWith(
      sessionResult({
        items: [item('a')],
        total: null,
        confirmedCount: 32,
        nextOffset: 20,
        hasMore: true,
        status: 'partial',
      }),
    );
    const page = await paginateV1(engine, i18n, v1Request());
    expect(page).toMatchObject({ total: 32, offset: 0, limit: 20 });
  });

  it('reports a pending empty page as a retryable 503', async () => {
    const engine = engineWith(
      sessionResult({ hasMore: true, status: 'partial' }),
    );
    const error = await rejection(paginateV1(engine, i18n, v1Request()));
    expect(error.getResponse().code).toBe('search_pending');
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('returns an exhausted empty page as a normal result', async () => {
    const engine = engineWith(
      sessionResult({ total: 1, confirmedCount: 1, nextOffset: 1 }),
    );
    const page = await paginateV1(engine, i18n, v1Request({ offset: 1 }));
    expect(page).toEqual({ items: [], total: 1, offset: 1, limit: 20 });
  });

  it('maps engine failures to wire errors', async () => {
    const engine = engineWith(
      new SearchSessionError('SEARCH_SESSION_INVALIDATED', 409),
    );
    const error = await rejection(paginateV1(engine, i18n, v1Request()));
    expect(error.getResponse().code).toBe('search_session_invalidated');
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });
});

describe('paginateSearch', () => {
  it('dispatches v2 requests with their request id', async () => {
    const engine = engineWith(sessionResult());
    await paginateSearch(engine, i18n, {
      ...v1Request(),
      paginationVersion: 2,
      requestId: 'r',
    });
    expect(engine.run).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'r', createIfMissing: true }),
    );
  });

  it.each([undefined, 1])(
    'dispatches pagination version %s to the implicit v1 session',
    async (paginationVersion) => {
      const engine = engineWith(sessionResult());
      await paginateSearch(engine, i18n, {
        ...v1Request(),
        paginationVersion,
      });
      const params = engine.run.mock.calls[0][0];
      expect(params.requestId).toBeUndefined();
      expect(params.sessionId.startsWith('v1-')).toBe(true);
    },
  );
});

// Literal digests pin the input arrays, their order and JSON serialization:
// rolling deploys must keep resolving the same durable session ids.
describe('session identity digests', () => {
  it('keeps the owner digest stable', () => {
    expect(sessionOwner('u', 'n')).toBe(
      '41adb5851dcff46ca8faafa7aaad04923bbf09bb668e79b57edd0a7fda0d5fa2',
    );
  });

  it('keeps the unfiltered fingerprint stable and prefixes the v1 session', async () => {
    const fingerprint =
      '67b87e71c8c6707c5b2ab34477c3ac51265d0705516f95e7d9ec8dc5e64c6fb5';
    expect(sessionFingerprint('u', 'n', 'q', null)).toBe(fingerprint);
    const engine = engineWith(sessionResult());
    await paginateV1(engine, i18n, v1Request());
    expect(engine.run.mock.calls[0][0].sessionId).toBe('v1-' + fingerprint);
  });

  it('sorts filter candidates before hashing', () => {
    const expected =
      'e118e503111574325fddf3a348742aaa8224c2919786d2160a9c8bbd376c6cb9';
    expect(sessionFingerprint('u', 'n', 'q', ['b', 'a'])).toBe(expected);
    expect(sessionFingerprint('u', 'n', 'q', ['a', 'b'])).toBe(expected);
  });

  it('distinguishes an empty filter from no filter', () => {
    expect(sessionFingerprint('u', 'n', 'q', [])).toBe(
      '8f1e3f411080fcebb2a1c9602b2ba23d2212f9f85adf1008c0fe4806bbff326e',
    );
    expect(sessionFingerprint('u', 'n', 'q', [])).not.toBe(
      sessionFingerprint('u', 'n', 'q', null),
    );
  });

  it('derives the v2 session id from the owner and request id', async () => {
    const engine = engineWith(sessionResult());
    await paginateV2(engine, i18n, { ...v1Request(), requestId: 'req-1' });
    expect(engine.run.mock.calls[0][0].sessionId).toBe(
      '66e16bfb14b708db170600a383c40e0317f8ac25f5a7f57715c0287c4a606381',
    );
  });
});
