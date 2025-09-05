import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { trace, context } from '@opentelemetry/api';

@Injectable()
export class UserInterceptor implements NestInterceptor {
  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const req = executionContext.switchToHttp().getRequest();
    const tracer = trace.getTracer('user-interceptor');
    tracer.startActiveSpan('UserInterceptor', {}, context.active(), (span) => {
      if (req.user?.id) {
        span.setAttribute('user.id', req.user.id);
      }
      span.end();
    });
    return next.handle();
  }
}
