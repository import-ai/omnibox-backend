import { SetMetadata } from '@nestjs/common';
import { APIKeyPermission } from 'omniboxd/api-key/api-key.entity';

export interface APIKeyAuthOptions {
  permissions?: APIKeyPermission[];
}

export const IS_API_KEY_AUTH = 'isApiKeyAuth';
export const APIKeyAuth = (options: APIKeyAuthOptions = {}) =>
  SetMetadata(IS_API_KEY_AUTH, { enabled: true, ...options });
