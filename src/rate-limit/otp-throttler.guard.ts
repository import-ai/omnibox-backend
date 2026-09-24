import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerRequest,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { isIP } from 'net';

import { otpThrottlerOptions } from './rate-limit.config';
import {
  FORWARDED_FOR_HEADER,
  OTP_THROTTLER_NAME,
  REAL_IP_HEADER,
} from './rate-limit.constants';

const IPV4_MAPPED_PREFIX = '::ffff:';

/**
 * Per-IP fixed-window limit for the OTP send endpoints.
 *
 * Every request that reaches this guard is counted, including the ones the
 * captcha guard rejects afterwards - a flood of bogus attempts is exactly what
 * this limit exists to throttle, and it runs before the paid Aliyun
 * verification. All OTP endpoints share one bucket per IP.
 */
@Injectable()
export class OtpThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(OtpThrottlerGuard.name);

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    super(options, storage, reflector);
  }

  /**
   * The host application may register other throttlers (omnibox-backend-pro
   * has `query` and `create`); only the `otp` one applies here. When the host
   * did not configure it at all, fall back to the env-derived options so the
   * limit is never silently absent.
   */
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    const configured = this.throttlers.find(
      (throttler) => throttler.name === OTP_THROTTLER_NAME,
    );
    this.throttlers = [configured ?? otpThrottlerOptions(this.configService)];
  }

  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (OtpThrottlerGuard.resolveClientIp(request)) {
      return Promise.resolve(false);
    }
    // IP resolution must never become an outage: allow and leave a trace.
    this.logger.debug(
      'Could not determine the client IP, skipping the per-IP OTP rate limit',
    );
    return Promise.resolve(true);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Counting must never become an outage either: a broken Redis degrades
      // to "no per-IP limit", not to a 500 on every OTP request.
      this.logger.error(
        'Per-IP OTP rate limit storage failed, allowing the request',
        error instanceof Error ? error.stack : String(error),
      );
      return true;
    }
  }

  protected getTracker(req: Request): Promise<string> {
    return Promise.resolve(OtpThrottlerGuard.resolveClientIp(req) ?? '');
  }

  protected generateKey(
    _context: ExecutionContext,
    tracker: string,
    name: string,
  ): string {
    return `${name}:${tracker}`;
  }

  protected throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    // The storage reports the remaining block time in seconds.
    const minutes = Math.max(1, Math.ceil(detail.timeToBlockExpire / 60));
    this.logger.warn(
      `Per-IP OTP rate limit exceeded (ip=${detail.tracker}, count=${detail.totalHits}, max=${detail.limit})`,
    );
    throw new HttpException(
      this.i18n.t('rateLimit.errors.tooManyRequests', { args: { minutes } }),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Resolve the client IP without Express `trust proxy`.
   *
   * Order: the FIRST hop of x-forwarded-for, then x-real-ip, then request.ip,
   * then the socket address. Candidates that are not a well-formed IP are
   * skipped, and IPv4-mapped IPv6 addresses are normalised so '::ffff:1.2.3.4'
   * and '1.2.3.4' share a bucket.
   *
   * Production runs two nginx hops (omnibox-website -> omnibox-web -> backend)
   * that both overwrite x-real-ip with their own peer and append that peer to
   * x-forwarded-for. Using x-real-ip or the last x-forwarded-for hop would
   * therefore put every user behind the same proxy address in one bucket. The
   * first hop is the only element that still carries the client address, at
   * the price of being client controlled: a caller can spoof it and mint fresh
   * buckets. That trade-off is accepted because this limit is a cost shield in
   * front of the captcha, and the captcha plus the per-contact limit remain as
   * backstops for a spoofing client.
   */
  static resolveClientIp(request: Request): string | undefined {
    const candidates = [
      OtpThrottlerGuard.firstForwardedFor(request),
      OtpThrottlerGuard.headerValue(request, REAL_IP_HEADER),
      request.ip,
      request.socket?.remoteAddress,
    ];

    for (const candidate of candidates) {
      const normalized = OtpThrottlerGuard.normalizeIp(candidate);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  /** The hop the outermost proxy saw, i.e. the client itself. */
  private static firstForwardedFor(request: Request): string | undefined {
    const raw = OtpThrottlerGuard.headerValue(request, FORWARDED_FOR_HEADER);
    return raw?.split(',')[0];
  }

  private static headerValue(
    request: Request,
    header: string,
  ): string | undefined {
    const value = request.headers?.[header];
    // A repeated header arrives as an array; the first entry is the one the
    // outermost hop wrote, matching the first-hop rule for the joined value.
    return Array.isArray(value) ? value[0] : value;
  }

  private static normalizeIp(value: string | undefined): string | undefined {
    let candidate = value?.trim() ?? '';
    if (candidate.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)) {
      candidate = candidate.slice(IPV4_MAPPED_PREFIX.length).trim();
    }
    return isIP(candidate) !== 0 ? candidate : undefined;
  }
}
