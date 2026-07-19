import { ConfigService } from '@nestjs/config';

import { NamespaceTier } from './dto/namespace-tier.enum';
import { NamespacesQuotaService } from './namespaces-quota.service';

describe('NamespacesQuotaService', () => {
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
    const service = new NamespacesQuotaService({
      get: jest.fn().mockReturnValue('https://pro.example.com'),
    } as unknown as ConfigService);
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
});
