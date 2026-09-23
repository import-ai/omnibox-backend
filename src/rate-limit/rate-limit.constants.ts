export const RATE_LIMIT_BY_IP_KEY = 'rateLimitByIp';

/**
 * Cache namespace for the per-IP OTP send window. The stored value is a plain
 * integer counter driven by Redis INCR, not the JSON record the first
 * implementation wrote, so the namespace differs from '/otp/ip-rate-limits' on
 * purpose: a deploy must never try to INCR a leftover JSON value.
 */
export const IP_RATE_LIMIT_NAMESPACE = '/otp/ip-rate-limit-counts';

/** Max OTP send requests per IP per window. */
export const IP_RATE_LIMIT_MAX_ENV = 'OBB_OTP_IP_RATE_LIMIT_MAX';
export const IP_RATE_LIMIT_MAX_DEFAULT = 15;

/** Length of the fixed window in milliseconds. */
export const IP_RATE_LIMIT_WINDOW_MS_ENV = 'OBB_OTP_IP_RATE_LIMIT_WINDOW_MS';
export const IP_RATE_LIMIT_WINDOW_MS_DEFAULT = 15 * 60 * 1000;

/**
 * Headers consulted to find the real client IP. In production these endpoints
 * sit behind the nginx api-gateway, which sets both:
 *
 *   proxy_set_header X-Real-IP $remote_addr;
 *   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 *
 * X-Real-IP is overwritten with the peer nginx actually saw, so it is
 * trustworthy. X-Forwarded-For only *appends* that peer, so everything before
 * the last element is attacker supplied - see IpRateLimitGuard.resolveClientIp.
 * Express `trust proxy` is deliberately not enabled in main.ts, so the guard
 * reads the headers itself instead of relying on `request.ip` being rewritten.
 */
export const FORWARDED_FOR_HEADER = 'x-forwarded-for';
export const REAL_IP_HEADER = 'x-real-ip';
