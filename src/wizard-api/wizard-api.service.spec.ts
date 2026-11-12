import 'reflect-metadata';

import { SearchRequestDto } from 'omniboxd/wizard/dto/search-request.dto';
import {
  buildWizardRequestHeaders,
  WizardAPIService,
} from 'omniboxd/wizard-api/wizard-api.service';

import wire from '../search/fixtures/snapshot-response';

describe('WizardAPIService.search', () => {
  it('maps total, has_more, and the deprecated raw_count', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [],
          total: 37,
          has_more: true,
          raw_count: 20,
        }),
    } as any);
    const service = new WizardAPIService(
      { getBaseUrl: () => Promise.resolve('http://wizard') } as any,
      { t: (key: string) => key } as any,
    );

    try {
      const request = new SearchRequestDto();
      request.query = 'query';
      request.namespaceId = 'namespace-id';
      request.userId = 'user-id';
      const response = await service.search(request);

      expect(response.total).toBe(37);
      expect(response.hasMore).toBe(true);
      expect((response as any).rawCount).toBe(20);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('serializes the remaining budget as timeout_ms', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ records: [] }),
    } as any);
    const service = new WizardAPIService(
      { getBaseUrl: () => Promise.resolve('http://wizard') } as any,
      { t: (key: string) => key } as any,
    );

    try {
      const request = new SearchRequestDto();
      request.query = 'query';
      request.namespaceId = 'namespace-id';
      request.timeoutMs = 9500;
      await service.search(request);

      const body = JSON.parse(
        fetchMock.mock.calls[0][1]!.body as string,
      ) as Record<string, unknown>;
      expect(body.timeout_ms).toBe(9500);
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('buildWizardRequestHeaders', () => {
  it('omits X-Request-Id when the inbound request has none', () => {
    const headers = buildWizardRequestHeaders({
      traceparent: '00-abc-def-01',
    });

    expect(headers).toEqual({
      'Content-Type': 'application/json',
      traceparent: '00-abc-def-01',
    });
    expect(headers).not.toHaveProperty('X-Request-Id');
  });

  it('omits X-Request-Id when the inbound request id is empty', () => {
    expect(buildWizardRequestHeaders({}, '')).not.toHaveProperty(
      'X-Request-Id',
    );
  });

  it('forwards a present request id and keeps trace headers', () => {
    expect(
      buildWizardRequestHeaders({ traceparent: '00-abc-def-01' }, 'req-123'),
    ).toEqual({
      'Content-Type': 'application/json',
      'X-Request-Id': 'req-123',
      traceparent: '00-abc-def-01',
    });
  });
});

describe('snapshot wire contract', () => {
  it.each([false, true])(
    'serializes only judgment inputs (cached=%s)',
    async (useCache) => {
      const mock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(wire),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              decisions: ['kept'],
              policy_signature: wire.policy_signature,
            }),
        } as any);
      const service = new WizardAPIService(
        { getBaseUrl: () => Promise.resolve('http://wizard') } as any,
        { t: (key: string) => key } as any,
      );
      try {
        const snapshot = await service.recallSearchSnapshot(
          { query: '610', namespace_id: 'n', user_id: 'u' },
          AbortSignal.timeout(1000),
        );
        expect(snapshot.records[0].chunk?.resourceId).toBe('resource-a');
        const cached = useCache
          ? JSON.parse(JSON.stringify(snapshot))
          : snapshot;
        const result = await service.judgeSearchCandidates(
          {
            query: '610',
            namespace_id: 'n',
            user_id: 'u',
            recall_depth: 200,
            policy_signature: snapshot.policySignature,
            records: cached.records,
            timeout_ms: 1000,
          },
          AbortSignal.timeout(1000),
        );
        expect(result.decisions).toEqual(['kept']);
        const body = JSON.parse(mock.mock.calls[1][1]!.body as string);
        expect(body.records[0]).toEqual({
          type: 'chunk',
          namespace_id: 'n',
          user_id: 'u',
          chunk: {
            title: '610 title',
            resource_id: 'resource-a',
            chunk_type: 'doc',
            parent_id: 'root',
            chunk_id: 'chunk-a',
            text: 'immutable snippet',
            start_index: null,
            end_index: null,
          },
        });
        expect(body.records[0].chunk).not.toHaveProperty('resourceId');
      } finally {
        mock.mockRestore();
      }
    },
  );
});
