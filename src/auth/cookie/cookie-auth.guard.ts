import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from 'omniboxd/auth/auth.service';
import { IS_COOKIE_AUTH, IS_PUBLIC_KEY } from 'omniboxd/auth/decorators';
import { CookieAuthOptions } from 'omniboxd/auth/cookie/cookie.auth.decorator';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class CookieAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
    private i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
      const message = this.i18n.t('auth.errors.tokenCookieRequired');
      throw new AppException(
        message,
        'TOKEN_COOKIE_REQUIRED',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = await this.authService.jwtVerify(token);

      if (!payload.sub) {
        if (onAuthFail === 'continue') {
          return true; // Continue without authentication
        }
        const message = this.i18n.t('auth.errors.invalidTokenPayload');
        throw new AppException(
          message,
          'INVALID_TOKEN_PAYLOAD',
          HttpStatus.UNAUTHORIZED,
        );
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

      // Re-throw AppException with original message
      if (error instanceof AppException) {
        throw error;
      }
      // For other errors (like JWT verification errors), throw generic message
      const message = this.i18n.t('auth.errors.tokenExpired');
      throw new AppException(message, 'TOKEN_EXPIRED', HttpStatus.UNAUTHORIZED);
    }
  }
}
