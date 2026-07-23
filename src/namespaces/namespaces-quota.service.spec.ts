import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NamespaceTier } from './dto/namespace-tier.enum';
import { NamespacesQuotaService } from './namespaces-quota.service';

describe('NamespacesQuotaService', () => {
  const createService = (proUrl = 'https://pro.example.com') =>
    new NamespacesQuotaService({
      get: jest.fn().mockReturnValue(proUrl),
    } as unknown as ConfigService);

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

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

  it('returns basic when the pro backend responds with an error', async () => {
    const service = createService();
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);

    await expect(service.getNamespaceTier('namespace-id')).resolves.toBe(
      NamespaceTier.BASIC,
    );
  });

  it('returns basic when the pro backend response cannot be parsed', async () => {
    const service = createService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('invalid json')),
    } as Response);

    await expect(service.getNamespaceTier('namespace-id')).resolves.toBe(
      NamespaceTier.BASIC,
    );
  });

  it('returns basic when the target namespace is missing', async () => {
    const service = createService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          namespaces: [
            {
              namespace_id: 'another-namespace-id',
              tier: 'premium',
              max_parallelism: 3,
            },
          ],
        }),
    } as Response);

    await expect(service.getNamespaceTier('namespace-id')).resolves.toBe(
      NamespaceTier.BASIC,
    );
  });

  it('returns basic when the pro backend returns an invalid tier', async () => {
    const service = createService();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          namespaces: [
            {
              namespace_id: 'namespace-id',
              tier: 'enterprise',
              max_parallelism: 3,
            },
          ],
        }),
    } as Response);

    await expect(service.getNamespaceTier('namespace-id')).resolves.toBe(
      NamespaceTier.BASIC,
    );
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
