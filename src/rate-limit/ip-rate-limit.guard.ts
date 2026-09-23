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
import { RateLimitCounter } from './rate-limit-counter.service';

const IPV4_MAPPED_PREFIX = '::ffff:';

@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(IpRateLimitGuard.name);
  private readonly max: number;
  private readonly windowMs: number;

  constructor(
    private readonly reflector: Reflector,
    private readonly counter: RateLimitCounter,
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
    let hit;
    try {
      hit = await this.counter.hit(IP_RATE_LIMIT_NAMESPACE, ip, this.windowMs);
    } catch (error) {
      // Counting must never become an outage either: a broken Redis degrades to
      // "no per-IP limit", not to a 500 on every OTP request.
      this.logger.error(
        `Per-IP OTP rate limit counter failed, allowing the request (ip=${ip})`,
        error instanceof Error ? error.stack : String(error),
      );
      return;
    }

    if (hit.count > this.max) {
      const remainingMinutes = Math.max(1, Math.ceil(hit.resetInMs / 60000));
      this.logger.warn(
        `Per-IP OTP rate limit exceeded (ip=${ip}, count=${hit.count}, max=${this.max})`,
      );
      throw new HttpException(
        this.i18n.t('rateLimit.errors.tooManyRequests', {
          args: { minutes: remainingMinutes },
        }),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Resolve the client IP without Express `trust proxy`.
   *
   * Order: x-real-ip, then the LAST hop of x-forwarded-for, then request.ip,
   * then the socket address. IPv4-mapped IPv6 addresses are normalised so
   * '::ffff:1.2.3.4' and '1.2.3.4' share a bucket.
   *
   * Never trust the FIRST hop of x-forwarded-for here. The gateway sets
   * `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, which
   * *appends* the peer it saw to whatever the client already sent, so element 0
   * is fully attacker controlled: `X-Forwarded-For: 1.2.3.<random>` on every
   * request would mint a fresh bucket each time and the limit would never trip,
   * removing exactly the shield this guard exists to provide. The last element
   * is the address nginx itself observed, and x-real-ip is overwritten by nginx
   * with `$remote_addr`, so both are trustworthy in this topology.
   */
  static resolveClientIp(request: Request): string | undefined {
    const candidates = [
      IpRateLimitGuard.headerValue(request, REAL_IP_HEADER),
      IpRateLimitGuard.lastForwardedFor(request),
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

  /** The hop the closest proxy appended, i.e. the peer it actually saw. */
  private static lastForwardedFor(request: Request): string | undefined {
    const raw = IpRateLimitGuard.headerValue(request, FORWARDED_FOR_HEADER);
    if (!raw) {
      return undefined;
    }
    const hops = raw
      .split(',')
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    return hops[hops.length - 1];
  }

  private static headerValue(
    request: Request,
    header: string,
  ): string | undefined {
    const value = request.headers?.[header];
    // A repeated header arrives as an array; nginx sets its own value last, so
    // the last entry is the one the gateway wrote.
    return Array.isArray(value) ? value[value.length - 1] : value;
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
