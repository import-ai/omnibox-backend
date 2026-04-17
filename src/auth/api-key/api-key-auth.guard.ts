import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reflector } from '@nestjs/core';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { IS_API_KEY_AUTH, IS_PUBLIC_KEY } from 'omniboxd/auth/decorators';
import { APIKeyAuthOptions } from 'omniboxd/auth/api-key/api-key.auth.decorator';
import { APIKeyPermission } from 'omniboxd/api-key/api-key.entity';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { User } from 'omniboxd/user/entities/user.entity';

@Injectable()
export class APIKeyAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private apiKeyService: APIKeyService,
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

    const apiKeyAuthOptions = this.reflector.getAllAndOverride<
      APIKeyAuthOptions & { enabled: boolean }
    >(IS_API_KEY_AUTH, [context.getHandler(), context.getClass()]);

    if (!apiKeyAuthOptions?.enabled) {
      return true; // Let other guards handle non-API key routes
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      const message = this.i18n.t('apikey.errors.authorizationHeaderRequired');
      throw new AppException(
        message,
        'AUTHORIZATION_HEADER_REQUIRED',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token.startsWith('sk-')) {
      const message = this.i18n.t('apikey.errors.invalidApiKeyFormat');
      throw new AppException(
        message,
        'INVALID_API_KEY_FORMAT',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const apiKey = await this.apiKeyService.findByValue(token);

    if (!apiKey) {
      const message = this.i18n.t('apikey.errors.invalidApiKey');
      throw new AppException(
        message,
        'INVALID_API_KEY',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Check if API key owner exists - TypeORM automatically excludes soft-deleted
    const user = await this.userRepository.findOne({
      where: { id: apiKey.userId },
    });

    if (!user) {
      const message = this.i18n.t('apikey.errors.invalidApiKey');
      throw new AppException(
        message,
        'INVALID_API_KEY',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Check required permissions if specified
    if (
      apiKeyAuthOptions.permissions &&
      apiKeyAuthOptions.permissions.length > 0
    ) {
      this.validatePermissions(
        apiKey.attrs.permissions || [],
        apiKeyAuthOptions.permissions,
      );
    }

    // Set API key data on request for use by parameter decorators
    request.apiKey = apiKey;
    request.user = { id: apiKey.userId };

    return true;
  }

  private validatePermissions(
    apiKeyPermissions: APIKeyPermission[],
    requiredPermissions: APIKeyPermission[],
  ): void {
    for (const required of requiredPermissions) {
      const apiKeyPermission = apiKeyPermissions.find(
        (p) => p.target === required.target,
      );

      if (!apiKeyPermission) {
        const message = this.i18n.t('apikey.errors.noPermissionForTarget', {
          args: { target: required.target },
        });
        throw new AppException(
          message,
          'NO_PERMISSION_FOR_TARGET',
          HttpStatus.FORBIDDEN,
        );
      }

      // Check if API key has all required permissions for this target
      for (const requiredPerm of required.permissions) {
        if (!apiKeyPermission.permissions.includes(requiredPerm)) {
          const message = this.i18n.t('apikey.errors.noSpecificPermission', {
            args: { permission: requiredPerm, target: required.target },
          });
          throw new AppException(
            message,
            'NO_SPECIFIC_PERMISSION',
            HttpStatus.FORBIDDEN,
          );
        }
      }
    }
  }
}
