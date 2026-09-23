import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { CacheService } from 'omniboxd/common/cache.service';

import {
  FORWARDED_FOR_HEADER,
  IP_RATE_LIMIT_MAX_DEFAULT,
  IP_RATE_LIMIT_MAX_ENV,
  IP_RATE_LIMIT_NAMESPACE,
  IP_RATE_LIMIT_WINDOW_MS_DEFAULT,
  IP_RATE_LIMIT_WINDOW_MS_ENV,
  RATE_LIMIT_BY_IP_KEY,
  REAL_IP_HEADER,
} from './rate-limit.constants';

/** Same shape as OtpService's per-contact record, so both windows behave alike. */
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const IPV4_MAPPED_PREFIX = '::ffff:';

@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(IpRateLimitGuard.name);
  private readonly max: number;
  private readonly windowMs: number;

  constructor(
    private readonly reflector: Reflector,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    this.max = this.readPositiveInt(
      IP_RATE_LIMIT_MAX_ENV,
      IP_RATE_LIMIT_MAX_DEFAULT,
    );
    this.windowMs = this.readPositiveInt(
      IP_RATE_LIMIT_WINDOW_MS_ENV,
      IP_RATE_LIMIT_WINDOW_MS_DEFAULT,
    );
  }

  private readPositiveInt(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      RATE_LIMIT_BY_IP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ip = IpRateLimitGuard.resolveClientIp(request);
    if (!ip) {
      // IP resolution must never become an outage: allow and leave a trace.
      this.logger.debug(
        'Could not determine the client IP, skipping the per-IP OTP rate limit',
      );
      return true;
    }

    // Every request that reaches this guard is counted, including the ones the
    // captcha guard rejects afterwards - a flood of bogus attempts is exactly
    // what this limit exists to throttle, and this guard runs before the paid
    // Aliyun verification.
    await this.consume(ip);
    return true;
  }

  private async consume(ip: string): Promise<void> {
    const now = Date.now();
    const record = await this.cacheService.get<RateLimitRecord>(
      IP_RATE_LIMIT_NAMESPACE,
      ip,
    );

    if (!record || now > record.resetAt) {
      // Start a new fixed window.
      const newRecord: RateLimitRecord = {
        count: 1,
        resetAt: now + this.windowMs,
      };
      await this.cacheService.set(
        IP_RATE_LIMIT_NAMESPACE,
        ip,
        newRecord,
        this.windowMs,
      );
      return;
    }

    if (record.count >= this.max) {
      const remainingMinutes = Math.ceil((record.resetAt - now) / 60000);
      this.logger.warn(
        `Per-IP OTP rate limit exceeded (ip=${ip}, count=${record.count}, max=${this.max})`,
      );
      throw new HttpException(
        this.i18n.t('rateLimit.errors.tooManyRequests', {
          args: { minutes: remainingMinutes },
        }),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.count++;
    const ttl = record.resetAt - now;
    await this.cacheService.set(IP_RATE_LIMIT_NAMESPACE, ip, record, ttl);
  }

  /**
   * Resolve the client IP without Express `trust proxy`: first hop of
   * x-forwarded-for, else x-real-ip, else the socket address. IPv4-mapped IPv6
   * addresses are normalised so '::ffff:1.2.3.4' and '1.2.3.4' share a bucket.
   */
  static resolveClientIp(request: Request): string | undefined {
    const candidates = [
      IpRateLimitGuard.firstForwardedFor(request),
      IpRateLimitGuard.headerValue(request, REAL_IP_HEADER),
      request.ip,
      request.socket?.remoteAddress,
    ];

    for (const candidate of candidates) {
      const normalized = IpRateLimitGuard.normalizeIp(candidate);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  private static firstForwardedFor(request: Request): string | undefined {
    const raw = IpRateLimitGuard.headerValue(request, FORWARDED_FOR_HEADER);
    return raw?.split(',')[0];
  }

  private static headerValue(
    request: Request,
    header: string,
  ): string | undefined {
    const value = request.headers?.[header];
    return Array.isArray(value) ? value[0] : value;
  }

  private static normalizeIp(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
      return undefined;
    }
    const lower = trimmed.toLowerCase();
    if (lower.startsWith(IPV4_MAPPED_PREFIX)) {
      const mapped = trimmed.slice(IPV4_MAPPED_PREFIX.length).trim();
      return mapped.length > 0 ? mapped : undefined;
    }
    return trimmed;
  }
}
