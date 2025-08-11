import { SetMetadata } from '@nestjs/common';

export interface CookieAuthOptions {
  onAuthFail?: 'reject' | 'continue';
}

export const IS_COOKIE_AUTH = 'isCookieAuth';
export const CookieAuth = (options: CookieAuthOptions = {}) =>
  SetMetadata(IS_COOKIE_AUTH, { enabled: true, ...options });
