import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { I18nService } from 'nestjs-i18n';

import { ContactRateLimiter } from './contact-rate-limiter.service';

const MAX = 3;
const WINDOW_MS = 15 * 60_000;

class FakeStorage implements ThrottlerStorage {
  hits = new Map<string, number>();
  calls: unknown[][] = [];

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    name: string,
  ): Promise<ThrottlerStorageRecord> {
    this.calls.push([key, ttl, limit, blockDuration, name]);
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    const isBlocked = totalHits > limit;
    return Promise.resolve({
      totalHits,
      timeToExpire: Math.ceil(ttl / 1000),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockDuration / 1000) : 0,
    });
  }
}

describe('ContactRateLimiter', () => {
  let limiter: ContactRateLimiter;
  let storage: FakeStorage;

  const buildLimiter = async (
    store: ThrottlerStorage,
  ): Promise<ContactRateLimiter> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactRateLimiter,
        { provide: getStorageToken(), useValue: store },
        {
          provide: I18nService,
          useValue: {
            t: jest.fn(
              (key: string, options?: { args?: { minutes?: number } }) =>
                `${key}:${options?.args?.minutes}`,
            ),
          },
        },
      ],
    }).compile();
    return module.get(ContactRateLimiter);
  };

  beforeEach(async () => {
    storage = new FakeStorage();
    limiter = await buildLimiter(storage);
  });

  it('allows the configured number of sends per contact', async () => {
    for (let i = 0; i < MAX; i++) {
      await expect(limiter.consume('a@example.com')).resolves.toBeUndefined();
    }
  });

  it('counts in its own namespace with a fifteen minute window', async () => {
    await limiter.consume('a@example.com');

    expect(storage.calls).toEqual([
      ['otp-contact:a@example.com', WINDOW_MS, MAX, WINDOW_MS, 'otp-contact'],
    ]);
  });

  it('rejects the next send with the minutes left once the window is full', async () => {
    for (let i = 0; i < MAX; i++) {
      await limiter.consume('a@example.com');
    }

    const error = await limiter
      .consume('a@example.com')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(
      'auth.errors.tooManyOtpRequests:15',
    );
  });

  it('keeps contacts independent of each other', async () => {
    for (let i = 0; i < MAX; i++) {
      await limiter.consume('a@example.com');
    }

    await expect(limiter.consume('a@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(limiter.consume('+8613800138000')).resolves.toBeUndefined();
  });

  it('propagates storage failures instead of failing open', async () => {
    const failing = await buildLimiter({
      increment: jest.fn().mockRejectedValue(new Error('redis is down')),
    });

    await expect(failing.consume('a@example.com')).rejects.toThrow(
      'redis is down',
    );
  });
});
