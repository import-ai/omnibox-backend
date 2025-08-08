import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from 'omniboxd/auth/auth.service';
import { IS_COOKIE_AUTH, IS_PUBLIC_KEY } from 'omniboxd/auth/decorators';
import { CookieAuthOptions } from 'omniboxd/auth/cookie/cookie.auth.decorator';

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

    const cookieAuthOptions = this.reflector.getAllAndOverride<
      CookieAuthOptions & { enabled: boolean }
    >(IS_COOKIE_AUTH, [context.getHandler(), context.getClass()]);

    if (!cookieAuthOptions?.enabled) {
      return true; // Let other guards handle non-cookie routes
    }

    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.token;
    const onAuthFail = cookieAuthOptions.onAuthFail || 'reject';

    if (!token) {
      if (onAuthFail === 'continue') {
        return true; // Continue without authentication
      }
      throw new UnauthorizedException(
        'Authentication token cookie is required',
      );
    }

    try {
      const payload = this.authService.jwtVerify(token);

      if (!payload.sub) {
        if (onAuthFail === 'continue') {
          return true; // Continue without authentication
        }
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
      if (onAuthFail === 'continue') {
        return true; // Continue without authentication
      }

      // Re-throw UnauthorizedException with original message
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // For other errors (like JWT verification errors), throw generic message
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
