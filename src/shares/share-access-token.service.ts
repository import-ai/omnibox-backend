import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  mintShareAccessToken,
  verifyShareAccessToken,
} from './share-access-token';

@Injectable()
export class ShareAccessTokenService {
  constructor(private readonly config: ConfigService) {}

  private secret(): string {
    const secret = this.config.get<string>('OBB_JWT_SECRET');
    if (!secret) {
      throw new Error('OBB_JWT_SECRET is required to sign share access tokens');
    }
    return secret;
  }

  mint(shareId: string): string {
    return mintShareAccessToken(this.secret(), shareId);
  }

  verify(token: string | undefined, shareId: string): boolean {
    return verifyShareAccessToken(this.secret(), token, shareId);
  }
}
