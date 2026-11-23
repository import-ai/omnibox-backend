import 'reflect-metadata';

import {
  buildWizardRequestHeaders,
  WizardAPIService,
} from 'omniboxd/wizard-api/wizard-api.service';

import wire from '../search/fixtures/snapshot-response';

const service = () =>
  new WizardAPIService(
    { getBaseUrl: () => Promise.resolve('http://wizard') } as any,
    { t: (key: string) => key } as any,
  );

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
  it('maps the snapshot records and truncation flag', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(wire),
    } as any);
    try {
      const snapshot = await service().recallSearchSnapshot(
        { query: '610', namespace_id: 'n', user_id: 'u' },
        AbortSignal.timeout(1000),
      );
      expect(snapshot.recallTruncated).toBe(false);
      expect(snapshot.records[0].chunk?.resourceId).toBe('resource-a');
      expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
        query: '610',
        namespace_id: 'n',
        user_id: 'u',
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it.each([
    [{ records: [] }],
    [{ records: 'bad', recall_truncated: false }],
    [{ records: [], recall_truncated: 'no' }],
  ])('rejects a malformed snapshot response %j', async (payload) => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    } as any);
    try {
      await expect(
        service().recallSearchSnapshot(
          { query: '610', namespace_id: 'n', user_id: 'u' },
          AbortSignal.timeout(1000),
        ),
      ).rejects.toThrow('Invalid search snapshot');
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('WizardAPIService agent target', () => {
  const body = { query: 'hello', tools: [] } as any;
  const resolution = { baseUrl: 'http://wizard-pro', target: 'pro' as const };

  it('delegates resolveAgentTarget to the provider', async () => {
    const resolveAgentTarget = jest.fn().mockResolvedValue(resolution);
    const service = new WizardAPIService(
      { resolveAgentTarget } as any,
      { t: jest.fn() } as any,
    );

    await expect(
      service.resolveAgentTarget('namespace-id', body),
    ).resolves.toBe(resolution);
    expect(resolveAgentTarget).toHaveBeenCalledWith('namespace-id', body);
  });

  it('reuses a resolved base url without asking the provider again', async () => {
    const getBaseUrl = jest.fn();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));
    const service = new WizardAPIService(
      { getBaseUrl } as any,
      {
        t: jest.fn(),
      } as any,
    );

    await service.createAgentStream(
      'namespace-id',
      'ask',
      body,
      'request-id',
      undefined,
      resolution,
    );

    expect(getBaseUrl).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://wizard-pro/api/v1/wizard/ask',
      expect.objectContaining({ method: 'POST' }),
    );
    fetchMock.mockRestore();
  });

  it('resolves the base url itself when no resolution is given', async () => {
    const getBaseUrl = jest.fn().mockResolvedValue('http://wizard');
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));
    const service = new WizardAPIService(
      { getBaseUrl } as any,
      {
        t: jest.fn(),
      } as any,
    );

    await service.createAgentStream(
      'namespace-id',
      'write',
      body,
      'request-id',
    );

    expect(getBaseUrl).toHaveBeenCalledWith('namespace-id', body);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://wizard/api/v1/wizard/write',
      expect.objectContaining({ method: 'POST' }),
    );
    fetchMock.mockRestore();
  });
});
