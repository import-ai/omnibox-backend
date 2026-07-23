import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Span, trace } from '@opentelemetry/api';

import { NamespaceTier } from './dto/namespace-tier.enum';
import { NamespacesQuotaService } from './namespaces-quota.service';

describe('NamespacesQuotaService', () => {
  const createService = (proUrl = 'https://pro.example.com') =>
    new NamespacesQuotaService({
      get: jest.fn().mockReturnValue(proUrl),
    } as unknown as ConfigService);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns basic when the pro backend is not configured', async () => {
    const service = new NamespacesQuotaService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);

    await expect(service.getNamespaceTier('namespace-id')).resolves.toBe(
      NamespaceTier.BASIC,
    );
  });

  it('returns the tier from the existing pro namespace endpoint', async () => {
    const service = createService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          namespaces: [
            {
              namespace_id: 'namespace-id',
              tier: 'premium',
              max_parallelism: 3,
            },
          ],
        }),
    } as Response);

    await expect(service.getNamespaceTier('namespace-id')).resolves.toBe(
      NamespaceTier.PREMIUM,
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://pro.example.com/internal/api/v1/pro-namespaces?namespace_ids=namespace-id',
    );
  });

  it('passes through errors from the pro backend', async () => {
    const service = createService();
    const recordException = jest.fn();
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({
      recordException,
    } as unknown as Span);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: HttpStatus.SERVICE_UNAVAILABLE,
      statusText: 'Service Unavailable',
      json: () =>
        Promise.resolve({
          message: 'Pro service is unavailable',
          code: 'PRO_SERVICE_UNAVAILABLE',
        }),
    } as Response);

    await expect(
      service.getNamespaceTier('namespace-id'),
    ).rejects.toMatchObject({
      code: 'PRO_SERVICE_UNAVAILABLE',
      message: 'Pro service is unavailable',
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
    expect(recordException).toHaveBeenCalledTimes(1);
  });

  it('throws when the pro backend response cannot be parsed', async () => {
    const service = createService();
    const error = new Error('invalid json');
    const recordException = jest.fn();
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({
      recordException,
    } as unknown as Span);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.reject(error),
    } as Response);

    await expect(service.getNamespaceTier('namespace-id')).rejects.toBe(error);
    expect(recordException).toHaveBeenCalledWith(error);
  });

  it('returns basic when the pro backend returns the basic tier', async () => {
    const service = createService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          namespaces: [
            {
              namespace_id: 'namespace-id',
              tier: 'basic',
              max_parallelism: 1,
            },
          ],
        }),
    } as Response);

    await expect(service.getNamespaceTier('namespace-id')).resolves.toBe(
      NamespaceTier.BASIC,
    );
  });
});
