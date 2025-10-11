import { SetMetadata } from '@nestjs/common';

export interface WsAuthConfig {
  optional?: boolean;
}

export const WS_AUTH_CONFIG_KEY = 'wsAuthConfig';

export const WsAuthOptions = (config: WsAuthConfig = {}) =>
  SetMetadata(WS_AUTH_CONFIG_KEY, config);
