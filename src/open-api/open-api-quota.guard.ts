import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_OPEN_API_QUOTA } from 'omniboxd/open-api/open-api-quota.decorator';
import { OpenAPIQuotaService } from 'omniboxd/open-api/open-api-quota.service';

@Injectable()
export class OpenAPIQuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly quotaService: OpenAPIQuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const url = request.originalUrl || request.url || '';
    if (!url.startsWith('/open/api/v1')) {
      return true;
    }

    const shouldSkip = this.reflector.getAllAndOverride<boolean>(
      SKIP_OPEN_API_QUOTA,
      [context.getHandler(), context.getClass()],
    );
    if (shouldSkip) {
      return true;
    }

    const apiKey = request.apiKey;
    if (!apiKey?.namespaceId) {
      return true;
    }

    await this.quotaService.assertAndConsume(apiKey.namespaceId);
    return true;
  }
}
