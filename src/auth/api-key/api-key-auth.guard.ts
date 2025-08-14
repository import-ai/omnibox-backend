import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { IS_API_KEY_AUTH, IS_PUBLIC_KEY } from 'omniboxd/auth/decorators';
import { APIKeyAuthOptions } from 'omniboxd/auth/api-key/api-key.auth.decorator';
import { APIKeyPermission } from 'omniboxd/api-key/api-key.entity';

@Injectable()
export class APIKeyAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private apiKeyService: APIKeyService,
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
      throw new UnauthorizedException('Authorization header is required');
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token.startsWith('sk-')) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const apiKey = await this.apiKeyService.findByValue(token);

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
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
        throw new ForbiddenException(
          `API key does not have permission for target: ${required.target}`,
        );
      }

      // Check if API key has all required permissions for this target
      for (const requiredPerm of required.permissions) {
        if (!apiKeyPermission.permissions.includes(requiredPerm)) {
          throw new ForbiddenException(
            `API key does not have ${requiredPerm} permission for target: ${required.target}`,
          );
        }
      }
    }
  }
}
