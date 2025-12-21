import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Observable } from 'rxjs';
import { NamespacesService } from '../namespaces.service';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class NamespaceAdminInterceptor implements NestInterceptor {
  constructor(
    private readonly namespacesService: NamespacesService,
    private readonly i18n: I18nService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const namespaceId = request.params?.namespaceId;
    const userId = request.user?.id;

    if (!namespaceId || !userId) {
      const message = this.i18n.t('namespace.errors.userNotOwnerOrAdmin');
      throw new AppException(
        message,
        'USER_NOT_OWNER_OR_ADMIN',
        HttpStatus.FORBIDDEN,
      );
    }

    const isOwnerOrAdmin = await this.namespacesService.userIsOwnerOrAdmin(
      namespaceId,
      userId,
    );

    if (!isOwnerOrAdmin) {
      const message = this.i18n.t('namespace.errors.userNotOwnerOrAdmin');
      throw new AppException(
        message,
        'USER_NOT_OWNER_OR_ADMIN',
        HttpStatus.FORBIDDEN,
      );
    }

    return next.handle();
  }
}
