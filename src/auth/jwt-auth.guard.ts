import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  IS_API_KEY_AUTH,
  IS_COOKIE_AUTH,
  IS_PUBLIC_KEY,
} from 'omniboxd/auth/decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isApiKeyAuth = this.reflector.getAllAndOverride<boolean>(
      IS_API_KEY_AUTH,
      [context.getHandler(), context.getClass()],
    );
    if (isApiKeyAuth) {
      return true; // Skip JWT validation for API key routes
    }

    const isCookieAuth = this.reflector.getAllAndOverride<boolean>(
      IS_COOKIE_AUTH,
      [context.getHandler(), context.getClass()],
    );
    if (isCookieAuth) {
      return true; // Skip JWT validation for cookie routes
    }

    return super.canActivate(context);
  }
}
