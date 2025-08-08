import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { IS_API_KEY_AUTH, IS_PUBLIC_KEY } from 'omniboxd/auth/decorators';

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

    const isApiKeyAuth = this.reflector.getAllAndOverride<boolean>(
      IS_API_KEY_AUTH,
      [context.getHandler(), context.getClass()],
    );

    if (!isApiKeyAuth) {
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

    // Set API key data on request for use by parameter decorators
    request.apiKey = apiKey;
    request.user = { id: apiKey.userId };

    return true;
  }
}
