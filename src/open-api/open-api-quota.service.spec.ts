import { ConfigService } from '@nestjs/config';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { createClient } from 'redis';
import { OpenAPIQuotaService } from './open-api-quota.service';

jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

describe('OpenAPIQuotaService', () => {
  const createService = (
    config: Record<string, string | undefined>,
    openApiRequestsPer24h: number,
  ) => {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;
    const namespacesQuotaService = {
      getNamespaceUsage: jest.fn().mockResolvedValue({
        openApiRequestsPer24h,
      }),
    } as unknown as NamespacesQuotaService;
    return new OpenAPIQuotaService(configService, namespacesQuotaService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when namespace usage has no open api quota', async () => {
    const service = createService({}, 0);

    await expect(
      service.assertAndConsume('namespace-id'),
    ).resolves.toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('does nothing when namespace usage quota is not positive', async () => {
    const service = createService({}, -1);

    await expect(
      service.assertAndConsume('namespace-id'),
    ).resolves.toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('requires redis when namespace usage quota is enabled', async () => {
    const service = createService({}, 1);

    await expect(service.assertAndConsume('namespace-id')).rejects.toThrow(
      'OBB_REDIS_URL is required when Open API requests per 24h quota is enabled',
    );
  });

  it('allows requests when redis quota script returns allowed', async () => {
    const redisClient = {
      isOpen: false,
      connect: jest.fn(),
      eval: jest.fn().mockResolvedValue([1, 1, 86_400_000]),
    };
    (createClient as jest.Mock).mockReturnValue(redisClient);
    const service = createService(
      {
        OBB_REDIS_URL: 'redis://localhost:6379',
      },
      2,
    );

    await expect(
      service.assertAndConsume('namespace-id'),
    ).resolves.toBeUndefined();
    expect(redisClient.connect).toHaveBeenCalledTimes(1);
    expect(redisClient.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['open-api-requests-per-24h:namespace-id'],
      arguments: ['2', '86400000'],
    });
  });

  it('returns unlimited quota status without redis when quota is disabled', async () => {
    const service = createService({}, 0);

    await expect(service.getQuotaStatus('namespace-id')).resolves.toEqual({
      limit: 0,
      used: 0,
      remaining: null,
      resetAt: null,
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('returns quota status from redis without consuming quota', async () => {
    const redisClient = {
      isOpen: false,
      connect: jest.fn(),
      get: jest.fn().mockResolvedValue('3'),
      pTTL: jest.fn().mockResolvedValue(60_000),
    };
    (createClient as jest.Mock).mockReturnValue(redisClient);
    const service = createService(
      {
        OBB_REDIS_URL: 'redis://localhost:6379',
      },
      10,
    );

    const before = Date.now();
    const status = await service.getQuotaStatus('namespace-id');
    const after = Date.now();

    expect(status.limit).toBe(10);
    expect(status.used).toBe(3);
    expect(status.remaining).toBe(7);
    expect(status.resetAt?.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(status.resetAt?.getTime()).toBeLessThanOrEqual(after + 60_000);
    expect(redisClient.get).toHaveBeenCalledWith(
      'open-api-requests-per-24h:namespace-id',
    );
    expect(redisClient.pTTL).toHaveBeenCalledWith(
      'open-api-requests-per-24h:namespace-id',
    );
  });

  it('returns full remaining quota when redis key does not exist', async () => {
    const redisClient = {
      isOpen: false,
      connect: jest.fn(),
      get: jest.fn().mockResolvedValue(null),
      pTTL: jest.fn().mockResolvedValue(-2),
    };
    (createClient as jest.Mock).mockReturnValue(redisClient);
    const service = createService(
      {
        OBB_REDIS_URL: 'redis://localhost:6379',
      },
      10,
    );

    await expect(service.getQuotaStatus('namespace-id')).resolves.toEqual({
      limit: 10,
      used: 0,
      remaining: 10,
      resetAt: null,
    });
  });

  it('rejects requests when redis quota script returns denied', async () => {
    const redisClient = {
      isOpen: false,
      connect: jest.fn(),
      eval: jest.fn().mockResolvedValue([0, 2, 86_000_000]),
    };
    (createClient as jest.Mock).mockReturnValue(redisClient);
    const service = createService(
      {
        OBB_REDIS_URL: 'redis://localhost:6379',
      },
      2,
    );

    await expect(
      service.assertAndConsume('namespace-id'),
    ).rejects.toMatchObject({
      code: 'OPEN_API_REQUESTS_PER_24H_EXCEEDED',
    });
  });
});
