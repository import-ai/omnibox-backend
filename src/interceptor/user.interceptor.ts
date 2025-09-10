import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { trace, context } from '@opentelemetry/api';

const LOGIN_URLS = ['/api/v1/login', '/api/v1/sign-up/confirm'];

@Injectable()
export class UserInterceptor implements NestInterceptor {
  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const req = executionContext.switchToHttp().getRequest();
    const tracer = trace.getTracer('user-interceptor');

    return tracer.startActiveSpan(
      'UserInterceptor',
      {},
      context.active(),
      (span) => {
        return next.handle().pipe(
          tap((responseBody) => {
            if (req.user?.id) {
              span.setAttribute('user.id', req.user.id);
            } else if (
              LOGIN_URLS.includes(req.url) &&
              req.method === 'POST' &&
              responseBody?.id
            ) {
              span.setAttribute('user.id', responseBody.id);
            }
          }),
          finalize(() => span.end()),
        );
      },
    );
  }
}
