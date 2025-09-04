import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { trace, context } from '@opentelemetry/api';

@Injectable()
export class TracingUserInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TracingUserInterceptor.name);

  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const req = executionContext.switchToHttp().getRequest();
    const span = trace.getSpan(context.active());
    if (req.user?.id && span) {
      span.setAttribute('user.id', req.user.id);
    }
    this.logger.log(`span ${span?.spanContext().spanId} user ${req.user?.id}`);
    return next.handle();
  }
}
