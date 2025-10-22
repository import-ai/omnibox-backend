import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { NamespacesService } from '../namespaces.service';

@Injectable()
export class NamespaceOwnerInterceptor implements NestInterceptor {
  constructor(private readonly namespacesService: NamespacesService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const namespaceId = request.params?.namespaceId;
    const userId = request.user?.id;

    if (!namespaceId || !userId) {
      throw new ForbiddenException(
        'current user is not owner of this namespace',
      );
    }

    const isOwner = await this.namespacesService.userIsOwner(
      namespaceId,
      userId,
    );

    if (!isOwner) {
      throw new ForbiddenException(
        'current user is not owner of this namespace',
      );
    }

    return next.handle();
  }
}
