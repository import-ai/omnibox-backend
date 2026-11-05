import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

const DEFAULT_JWT_EXPIRE_SECONDS = 2678400;

/**
 * Whether the browser reached this service over HTTPS. Private deployments can
 * serve plain HTTP, and a Secure cookie is silently dropped there.
 */
export function isSecureRequest(req: Request): boolean {
  if (req.secure) {
    return true;
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  return proto?.split(',')[0].trim() === 'https';
}

/**
 * Lifetime of the session cookie, in milliseconds.
 */
export function getSessionCookieMaxAge(configService: ConfigService): number {
  const expiresInSeconds = parseInt(
    configService.get('OBB_JWT_EXPIRE', `${DEFAULT_JWT_EXPIRE_SECONDS}`),
    10,
  );
  return (
    (Number.isFinite(expiresInSeconds)
      ? expiresInSeconds
      : DEFAULT_JWT_EXPIRE_SECONDS) * 1000
  );
}

/**
 * Writes the httpOnly session cookie the gateway checks. Callers that hand a
 * token back as JSON must also set this cookie, otherwise a full-page
 * navigation to the root looks signed out.
 */
export function setSessionCookie(
  req: Request,
  res: Response,
  token: string,
  maxAge: number,
): void {
  const secure = isSecureRequest(req);

  res.cookie('token', token, {
    httpOnly: true,
    secure,
    // SameSite=None requires Secure, so plain HTTP deployments fall back to
    // Lax; otherwise browsers reject the cookie and every request looks
    // anonymous.
    sameSite: secure ? 'none' : 'lax',
    path: '/',
    maxAge,
  });
}
