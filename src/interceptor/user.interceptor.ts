import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { trace, context } from '@opentelemetry/api';
import { Socket } from 'socket.io';

const LOGIN_URLS = ['/api/v1/login', '/api/v1/auth/accept-invite'];

@Injectable()
export class UserInterceptor implements NestInterceptor {
  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const tracer = trace.getTracer('user-interceptor');
    return tracer.startActiveSpan(
      'UserInterceptor',
      {},
      context.active(),
      (span) => {
        const ctxType = executionContext.getType();
        let userId: string | null = null;
        if (ctxType === 'http') {
          const httpReq = executionContext.switchToHttp().getRequest();
          if (httpReq.user?.id) {
            userId = httpReq.user.id;
          }
        } else if (ctxType === 'ws') {
          const client = executionContext.switchToWs().getClient<Socket>();
          userId = client.data?.userId ?? null;
        }
        return next.handle().pipe(
          tap((responseBody) => {
            if (!userId && ctxType === 'http') {
              const httpReq = executionContext.switchToHttp().getRequest();
              if (
                LOGIN_URLS.includes(httpReq.url) &&
                httpReq.method === 'POST' &&
                responseBody?.id
              ) {
                userId = responseBody.id;
              }
            }
          }),
          finalize(() => {
            if (userId) {
              span.setAttribute('user.id', userId);
            }
            span.end();
          }),
        );
      },
    );
  }
}
