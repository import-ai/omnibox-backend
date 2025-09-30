import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthService } from 'omniboxd/auth/auth.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const client: Socket = context.switchToWs().getClient<Socket>();
      const token = this.extractTokenFromHeader(client);
      if (!token) {
        throw new WsException('Unauthorized: No token');
      }
      const payload = this.authService.jwtVerify(token);
      client.data.userId = payload.sub;
      return true;
    } catch (error) {
      throw new WsException('Unauthorized: ' + error.message);
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
