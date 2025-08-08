import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from 'omniboxd/auth/auth.service';
import { IS_COOKIE_AUTH, IS_PUBLIC_KEY } from 'omniboxd/auth/decorators';

@Injectable()
export class CookieAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const isCookieAuth = this.reflector.getAllAndOverride<boolean>(
      IS_COOKIE_AUTH,
      [context.getHandler(), context.getClass()],
    );

    if (!isCookieAuth) {
      return true; // Let other guards handle non-cookie routes
    }

    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.token;

    if (!token) {
      throw new UnauthorizedException(
        'Authentication token cookie is required',
      );
    }

    try {
      const payload = this.authService.jwtVerify(token);

      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Set user data on request (same structure as JWT authentication)
      request.user = {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
      };

      return true;
    } catch (error) {
      // Re-throw UnauthorizedException with original message
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // For other errors (like JWT verification errors), throw generic message
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
