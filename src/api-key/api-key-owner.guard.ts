import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

import { APIKeyService } from './api-key.service';

@Injectable()
export class APIKeyOwnerGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: APIKeyService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { id: string };
      body?: { user_id?: string };
      query?: { user_id?: string };
      params?: { id?: string };
      method: string;
    }>();
    const userId = request.user?.id;
    if (
      !userId ||
      (request.query?.user_id && request.query.user_id !== userId) ||
      (request.method === 'POST' && request.body?.user_id !== userId)
    ) {
      this.deny();
    }
    if (request.params?.id) {
      const key = await this.apiKeyService.findOne(request.params.id);
      if (key.user_id !== userId) this.deny();
    }
    return true;
  }

  private deny(): never {
    throw new AppException(
      this.i18n.t('auth.errors.notAuthorized'),
      'NOT_AUTHORIZED',
      HttpStatus.FORBIDDEN,
    );
  }
}
