import 'reflect-metadata';

import { SearchRequestDto } from 'omniboxd/wizard/dto/search-request.dto';
import {
  buildWizardRequestHeaders,
  WizardAPIService,
} from 'omniboxd/wizard-api/wizard-api.service';

describe('WizardAPIService.search', () => {
  it('maps total and has_more from the wizard search response', async () => {
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
      expect((response as any).rawCount).toBeUndefined();
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
