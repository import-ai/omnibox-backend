import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { UserService } from 'omniboxd/user/user.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient<Socket>();
      const token = this.extractTokenFromHeader(client);

      if (!token) {
        throw new WsException('Unauthorized: No token');
      }

      const payload = await this.jwtService.verifyAsync(token);

      const user = await this.userService.find(payload.sub);

      if (!user) {
        throw new WsException('Unauthorized: User not found');
      }

      client.data.user = user;
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
