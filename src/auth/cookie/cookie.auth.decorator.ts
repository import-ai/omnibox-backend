import { SetMetadata } from '@nestjs/common';

export const IS_COOKIE_AUTH = 'isCookieAuth';
export const CookieAuth = () => SetMetadata(IS_COOKIE_AUTH, true);
