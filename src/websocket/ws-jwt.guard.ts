import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthService } from 'omniboxd/auth/auth.service';
import {
  WS_AUTH_CONFIG_KEY,
  WsAuthConfig,
} from 'omniboxd/auth/decorators/ws-auth-options.decorator';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const wsAuthConfig = this.reflector.getAllAndOverride<WsAuthConfig>(
      WS_AUTH_CONFIG_KEY,
      [context.getHandler(), context.getClass()],
    );

    try {
      const client: Socket = context.switchToWs().getClient<Socket>();
      const token = this.extractTokenFromHeader(client);
      if (!token) {
        const message = this.i18n.t('auth.errors.noToken');
        throw new WsException(`Unauthorized: ${message}`);
      }
      const payload = await this.authService.jwtVerify(token);
      client.data.userId = payload.sub;
      return true;
    } catch (error) {
      if (wsAuthConfig?.optional) {
        return true;
      }
      const unauthorizedMsg = this.i18n.t('auth.errors.unauthorized');
      throw new WsException(`${unauthorizedMsg}: ${error.message}`);
    }
  }

  private extractTokenFromHeader(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (authToken?.startsWith('Bearer ')) {
      return authToken.substring(7);
    }
    return undefined;
  }
}
