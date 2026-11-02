import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

const DEFAULT_JWT_EXPIRE_SECONDS = 2678400;

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
  res: Response,
  token: string,
  maxAge: number,
): void {
  res.cookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge,
  });
}
