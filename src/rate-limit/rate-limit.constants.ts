export const RATE_LIMIT_BY_IP_KEY = 'rateLimitByIp';

/** Cache namespace for the per-IP OTP send window (Redis-backed CacheService). */
export const IP_RATE_LIMIT_NAMESPACE = '/otp/ip-rate-limits';

/** Max OTP send requests per IP per window. */
export const IP_RATE_LIMIT_MAX_ENV = 'OBB_OTP_IP_RATE_LIMIT_MAX';
export const IP_RATE_LIMIT_MAX_DEFAULT = 15;

/** Length of the fixed window in milliseconds. */
export const IP_RATE_LIMIT_WINDOW_MS_ENV = 'OBB_OTP_IP_RATE_LIMIT_WINDOW_MS';
export const IP_RATE_LIMIT_WINDOW_MS_DEFAULT = 15 * 60 * 1000;

/**
 * Headers consulted to find the real client IP, in priority order. In
 * production these endpoints sit behind the nginx api-gateway, which sets both.
 * Express `trust proxy` is deliberately not enabled in main.ts, so the guard
 * reads the headers itself instead of relying on `request.ip` being rewritten.
 */
export const FORWARDED_FOR_HEADER = 'x-forwarded-for';
export const REAL_IP_HEADER = 'x-real-ip';
