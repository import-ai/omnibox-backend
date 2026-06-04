import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { OpenAPIQuotaService } from './open-api-quota.service';

jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

describe('OpenAPIQuotaService', () => {
  const createService = (config: Record<string, string | undefined>) => {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;
    return new OpenAPIQuotaService(configService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when requests per 24h is not configured', async () => {
    const service = createService({});

    await expect(
      service.assertAndConsume('namespace-id'),
    ).resolves.toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('does nothing when requests per 24h is not positive', async () => {
    const service = createService({ OBB_OPEN_API_REQUESTS_PER_24H: '0' });

    await expect(
      service.assertAndConsume('namespace-id'),
    ).resolves.toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('requires redis when requests per 24h is enabled', async () => {
    const service = createService({ OBB_OPEN_API_REQUESTS_PER_24H: '1' });

    await expect(service.assertAndConsume('namespace-id')).rejects.toThrow(
      'OBB_REDIS_URL is required when OBB_OPEN_API_REQUESTS_PER_24H is enabled',
    );
  });

  it('allows requests when redis quota script returns allowed', async () => {
    const redisClient = {
      isOpen: false,
      connect: jest.fn(),
      eval: jest.fn().mockResolvedValue([1, 1, 86_400_000]),
    };
    (createClient as jest.Mock).mockReturnValue(redisClient);
    const service = createService({
      OBB_OPEN_API_REQUESTS_PER_24H: '2',
      OBB_REDIS_URL: 'redis://localhost:6379',
    });

    await expect(
      service.assertAndConsume('namespace-id'),
    ).resolves.toBeUndefined();
    expect(redisClient.connect).toHaveBeenCalledTimes(1);
    expect(redisClient.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['open-api-requests-per-24h:namespace-id'],
      arguments: ['2', '86400000'],
    });
  });

  it('rejects requests when redis quota script returns denied', async () => {
    const redisClient = {
      isOpen: false,
      connect: jest.fn(),
      eval: jest.fn().mockResolvedValue([0, 2, 86_000_000]),
    };
    (createClient as jest.Mock).mockReturnValue(redisClient);
    const service = createService({
      OBB_OPEN_API_REQUESTS_PER_24H: '2',
      OBB_REDIS_URL: 'redis://localhost:6379',
    });

    await expect(
      service.assertAndConsume('namespace-id'),
    ).rejects.toMatchObject({
      code: 'OPEN_API_REQUESTS_PER_24H_EXCEEDED',
    });
  });
});
