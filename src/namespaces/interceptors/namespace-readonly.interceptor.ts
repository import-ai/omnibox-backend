import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Observable } from 'rxjs';
import { NamespacesQuotaService } from '../namespaces-quota.service';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class NamespaceReadonlyInterceptor implements NestInterceptor {
  constructor(
    private readonly namespacesQuotaService: NamespacesQuotaService,
    private readonly i18n: I18nService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const namespaceId = request.params?.namespaceId;

    if (!namespaceId) {
      return next.handle();
    }

    const isReadonly =
      await this.namespacesQuotaService.isNamespaceReadonly(namespaceId);

    if (isReadonly) {
      const message = this.i18n.t('namespace.errors.storageQuotaExceeded');
      throw new AppException(
        message,
        'STORAGE_QUOTA_EXCEEDED',
        HttpStatus.FORBIDDEN,
      );
    }

    return next.handle();
  }
}
