import { ConfigService } from '@nestjs/config';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import {
  IndexRecordDto,
  IndexRecordType,
} from 'omniboxd/wizard/dto/index-record.dto';

import { SearchSessionService } from './search-session.service';
import { SearchSessionStore } from './search-session.store';

const record = (id: string, chunkId = id): IndexRecordDto => ({
  id: chunkId,
  type: IndexRecordType.CHUNK,
  namespaceId: 'n',
  userId: 'u',
  chunk: {
    resourceId: id,
    chunkId,
    title: id,
    text: 'query',
    chunkType: 'doc',
  } as any,
});

function fixture(
  records = Array.from({ length: 75 }, (_, i) => record('r' + i)),
  enabled = false,
) {
  const config = new ConfigService({
    ENV: 'test',
    OBB_REDIS_URL: '',
    OBB_SEARCH_RECALL_DEPTH: 200,
  });
  const store = new SearchSessionStore(config);
  const hidden = new Set<string>();
  const attrs = new Map<
    string,
    { attrs: Record<string, unknown>; resourceType: ResourceType }
  >();
  const resources = {
    batchGetParentResources: jest.fn((_n: string, ids: string[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter((id) => !hidden.has(id))
            .map((id) => [
              id,
              {
                id,
                resourceType: ResourceType.DOC,
                attrs: {},
                ...attrs.get(id),
              },
            ]),
        ),
      ),
    ),
  };
  const permissions = {
    getCurrentPermissions: jest.fn((_u: string, _n: string, rs: any[]) =>
      Promise.resolve(
        new Map(rs.map((r) => [r.id, ResourcePermission.CAN_VIEW])),
      ),
    ),
  };
  const wizard = {
    recallSearchSnapshot: jest
      .fn<
        Promise<import('./search-session.types').SearchSnapshot>,
        [Record<string, unknown>?]
      >()
      .mockResolvedValue({
        records,
        recallTruncated: false,
        relevanceEnabled: enabled,
        policySignature: 'p',
      }),
    judgeSearchCandidates: jest.fn((body: { records: IndexRecordDto[] }) =>
      Promise.resolve({
        decisions: body.records.map(() => 'kept'),
        policy_signature: 'p',
      }),
    ),
  };
  const service = new SearchSessionService(
    store,
    wizard as any,
    resources as any,
    permissions as any,
    config,
    { t: () => 'retry' } as any,
  );
  const page = (
    offset = 0,
    searchId?: string,
    requestId = 'req-' + offset,
    limit = 20,
  ) =>
    service.paginate('u', 'n', 'q', null, {
      offset,
      limit,
      paginationVersion: 2,
      searchId,
      requestId,
    });
  return { service, store, wizard, resources, hidden, attrs, page, config };
}

it('reaches resources behind 200 duplicate chunks without replaying recall', async () => {
  const f = fixture([
    ...Array.from({ length: 200 }, (_, i) => record('A', 'a' + i)),
    ...Array.from({ length: 50 }, (_, i) => record('b' + i)),
  ]);
  const first = await f.page();
  const second = await f.page(first.nextOffset, first.searchId);
  const third = await f.page(second.nextOffset, first.searchId);
  const ids = [...first.items, ...second.items, ...third.items].map(
    (i) => i.resourceId,
  );
  expect(ids).toHaveLength(51);
  expect(new Set(ids).size).toBe(51);
  expect(third.total).toBe(51);
  expect(third.hasMore).toBe(false);
  expect(f.wizard.recallSearchSnapshot).toHaveBeenCalledTimes(1);
  expect(f.wizard.judgeSearchCandidates).not.toHaveBeenCalled();
});

it('publishes a stable prefix despite out-of-order pending decisions', async () => {
  const f = fixture([record('A'), record('B'), record('C')], true);
  f.wizard.judgeSearchCandidates.mockResolvedValueOnce({
    decisions: ['pending', 'kept', 'kept'],
    policy_signature: 'p',
  });
  const first = await f.page();
  expect(first).toMatchObject({
    items: [],
    nextOffset: 0,
    total: null,
    hasMore: true,
    status: 'partial',
  });
  const replay = await f.page(0, first.searchId, 'req-0');
  expect(replay).toEqual(first);
  expect(f.wizard.judgeSearchCandidates).toHaveBeenCalledTimes(1);
  const next = await f.page(0, first.searchId, 'retry');
  expect(next.items.map((i) => i.resourceId)).toEqual(['A', 'B', 'C']);
  expect(
    f.wizard.judgeSearchCandidates.mock.calls[1][0].records.map(
      (r) => r.chunk!.resourceId,
    ),
  ).toEqual(['A']);
});

it('v1 and v2 use the same snapshot engine and v1 never reports pending as empty', async () => {
  const f = fixture([record('A')], true);
  f.wizard.judgeSearchCandidates.mockResolvedValueOnce({
    decisions: ['pending'],
    policy_signature: 'p',
  });
  await expect(
    f.service.paginate('u', 'n', 'q', null, { offset: 0, limit: 20 }),
  ).rejects.toMatchObject({ code: 'SEARCH_PENDING' });
  const next = await f.service.paginate('u', 'n', 'q', null, {
    offset: 0,
    limit: 20,
  });
  expect(next.total).toBe(1);
  expect(next.items.map((i) => i.resourceId)).toEqual(['A']);
  expect(f.wizard.recallSearchSnapshot).toHaveBeenCalledTimes(1);
});

it('returns a numeric continuation lower bound for partial v1 results', async () => {
  const f = fixture(Array.from({ length: 250 }, (_, i) => record('r' + i)));
  for (let i = 1; i < 240; i++) f.hidden.add('r' + i);
  const first = await f.service.paginate('u', 'n', 'q', null, {
    offset: 0,
    limit: 20,
  });
  expect(first.items).toHaveLength(1);
  expect(first.hasMore).toBe(true);
  expect(first.total).toBeGreaterThan(1);
  const next = await f.service.paginate('u', 'n', 'q', null, {
    offset: 1,
    limit: 20,
  });
  expect(next.items[0].resourceId).toBe('r240');
  expect(f.wizard.recallSearchSnapshot).toHaveBeenCalledTimes(1);
});

it('permanently terminates judgment after three pending attempts', async () => {
  const f = fixture([record('A')], true);
  f.wizard.judgeSearchCandidates.mockResolvedValue({
    decisions: ['pending'],
    policy_signature: 'p',
  });
  const first = await f.page();
  await f.page(0, first.searchId, 'two');
  await expect(f.page(0, first.searchId, 'three')).rejects.toMatchObject({
    code: 'SEARCH_JUDGMENT_FAILED',
  });
  await expect(f.page(0, first.searchId, 'four')).rejects.toMatchObject({
    code: 'SEARCH_JUDGMENT_FAILED',
  });
  expect(f.wizard.judgeSearchCandidates).toHaveBeenCalledTimes(3);
});

it('rejects expired explicit sessions without silently rebuilding', async () => {
  const f = fixture();
  await expect(f.page(20, 'missing')).rejects.toMatchObject({
    code: 'SEARCH_SESSION_EXPIRED',
  });
  expect(f.wizard.recallSearchSnapshot).not.toHaveBeenCalled();
});

it('skips stale unconfirmed resources but invalidates revoked confirmed resources on replay', async () => {
  const f = fixture([record('deleted'), record('A')]);
  f.hidden.add('deleted');
  const first = await f.page();
  expect(first.items.map((i) => i.resourceId)).toEqual(['A']);
  f.hidden.add('A');
  await expect(f.page(0, first.searchId)).rejects.toMatchObject({
    code: 'SEARCH_SESSION_INVALIDATED',
  });
});

it('binds sessions to identity, query and candidate filters', async () => {
  const f = fixture();
  const first = await f.page();
  await expect(
    f.service.paginate('u', 'n', 'changed', null, {
      offset: 20,
      limit: 20,
      paginationVersion: 2,
      searchId: first.searchId,
      requestId: 'x',
    }),
  ).rejects.toMatchObject({ code: 'SEARCH_SESSION_INVALIDATED' });
  await expect(
    f.service.paginate('other', 'n', 'q', null, {
      offset: 20,
      limit: 20,
      paginationVersion: 2,
      searchId: first.searchId,
      requestId: 'x',
    }),
  ).rejects.toMatchObject({ code: 'SEARCH_SESSION_EXPIRED' });
});

it('does not publish a snapshot when initialization fails', async () => {
  const f = fixture();
  f.wizard.recallSearchSnapshot.mockRejectedValue(new Error('branch failed'));
  await expect(f.page()).rejects.toMatchObject({ code: 'SEARCH_UNAVAILABLE' });
  expect(f.wizard.judgeSearchCandidates).not.toHaveBeenCalled();
});

it('deduplicates the same article across folders without collapsing other feeds', async () => {
  const f = fixture([record('a'), record('b'), record('c')]);
  for (const id of ['a', 'b', 'c'])
    f.attrs.set(id, {
      resourceType: ResourceType.RSS_ITEM,
      attrs: { guid: 'same', url: id === 'c' ? 'feed2' : 'feed1' },
    });
  expect((await f.page()).items.map((i) => i.resourceId)).toEqual(['a', 'c']);
});

it('preserves literal-free semantic matches and restricts recall to filter candidates', async () => {
  const f = fixture([record('A'), record('B')]);
  const p = await f.service.paginate('u', 'n', 'unrelated wording', ['B'], {
    offset: 0,
    limit: 20,
  });
  expect(p.items.map((i) => i.resourceId)).toEqual(['B']);
  expect(f.wizard.recallSearchSnapshot.mock.calls[0][0]).toMatchObject({
    resource_ids: ['B'],
  });
});

it('serializes concurrent state advancement', async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const original = f.wizard.recallSearchSnapshot.getMockImplementation()!;
  f.wizard.recallSearchSnapshot.mockImplementationOnce(async () => {
    await gate;
    return original();
  });
  const first = f.page();
  await Promise.resolve();
  await expect(f.page()).rejects.toMatchObject({ code: 'SEARCH_SESSION_BUSY' });
  release();
  await first;
  expect(f.wizard.recallSearchSnapshot).toHaveBeenCalledTimes(1);
});

it('returns a complete v2 envelope for empty filter candidates without widening recall', async () => {
  const f = fixture();
  const result = await f.service.paginate('u', 'n', 'q', [], {
    offset: 0,
    limit: 20,
    paginationVersion: 2,
    requestId: 'empty',
  });
  expect(result).toMatchObject({
    items: [],
    total: 0,
    hasMore: false,
    status: 'complete',
    nextOffset: 0,
    searchId: expect.any(String),
  });
  expect(f.wizard.recallSearchSnapshot).not.toHaveBeenCalled();
});

it('does not invoke a judgment unless its attempt reservation is durable', async () => {
  const f = fixture([record('A')], true);
  const original = f.store.exclusive.bind(f.store);
  jest.spyOn(f.store, 'exclusive').mockImplementation((owner, id, operation) =>
    original(owner, id, (state, save) =>
      operation(state, (value: any) => {
        if (Object.keys(value.attempts).length)
          return Promise.reject(new Error('Redis commit unavailable'));
        return save(value);
      }),
    ),
  );
  await expect(f.page()).rejects.toMatchObject({ code: 'SEARCH_UNAVAILABLE' });
  expect(f.wizard.judgeSearchCandidates).not.toHaveBeenCalled();
});
