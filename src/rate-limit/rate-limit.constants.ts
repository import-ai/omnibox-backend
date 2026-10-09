/**
 * Name of the `@nestjs/throttler` throttler that backs the per-IP OTP send
 * limit. `OtpThrottlerGuard` applies this one only, so any other throttler the
 * host application registers never touches the OTP endpoints.
 */
export const OTP_THROTTLER_NAME = 'otp';

/** Max OTP send requests per IP per window. */
export const IP_RATE_LIMIT_MAX_ENV = 'OBB_OTP_IP_RATE_LIMIT_MAX';
export const IP_RATE_LIMIT_MAX_DEFAULT = 15;

/** Length of the fixed window in milliseconds. */
export const IP_RATE_LIMIT_WINDOW_MS_ENV = 'OBB_OTP_IP_RATE_LIMIT_WINDOW_MS';
export const IP_RATE_LIMIT_WINDOW_MS_DEFAULT = 15 * 60 * 1000;

/**
 * Per-contact (email address or phone number) OTP send limit. It is shared by
 * the login, signup and binding flows, so one inbox or phone cannot be flooded
 * by alternating between endpoints.
 */
export const CONTACT_RATE_LIMIT_NAME = 'otp-contact';
export const CONTACT_RATE_LIMIT_MAX = 3;
export const CONTACT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Headers consulted to find the real client IP. In production a request passes
 * two nginx hops before it reaches the backend (omnibox-website, then
 * omnibox-web), and each of them sets:
 *
 *   proxy_set_header X-Real-IP $remote_addr;
 *   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 *
 * X-Real-IP is overwritten at every hop, so at the backend it holds the
 * address of the previous proxy, not the client. X-Forwarded-For only appends,
 * so its FIRST element is the address the outermost hop saw - that is the only
 * place the client IP survives. Express `trust proxy` is deliberately not
 * enabled in main.ts, so the guard reads the headers itself instead of relying
 * on `request.ip` being rewritten. See OtpThrottlerGuard.resolveClientIp for
 * the trade-off this implies.
 */
export const FORWARDED_FOR_HEADER = 'x-forwarded-for';
export const REAL_IP_HEADER = 'x-real-ip';
