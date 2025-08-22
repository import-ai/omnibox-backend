export interface AuthorizationCode {
  code: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  expiresAt: Date;
}

export interface OAuthConfig {
  supportedGrantTypes: string[];
  authorizationCodeExpiryMinutes: number;
}

export const DEFAULT_OAUTH_CONFIG: OAuthConfig = {
  supportedGrantTypes: ['authorization_code'],
  authorizationCodeExpiryMinutes: 10,
};
