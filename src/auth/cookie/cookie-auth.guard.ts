import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AuthService } from 'omniboxd/auth/auth.service';
import { CookieAuthOptions } from 'omniboxd/auth/cookie/cookie.auth.decorator';
import { IS_COOKIE_AUTH, IS_PUBLIC_KEY } from 'omniboxd/auth/decorators';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { User } from 'omniboxd/user/entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class CookieAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
    private i18n: I18nService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
      const payload = this.authService.jwtVerify(token);

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

      // Check if user exists - TypeORM automatically excludes soft-deleted
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        if (onAuthFail === 'continue') {
          return true; // Continue without authentication
        }
        const message = this.i18n.t('auth.errors.invalidToken');
        throw new AppException(
          message,
          'INVALID_TOKEN',
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
