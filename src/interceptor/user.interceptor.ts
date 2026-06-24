import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { Socket } from 'socket.io';

const LOGIN_ROUTES = [
  { method: 'GET', url: '/api/v1/wechat/callback' },
  { method: 'POST', url: '/api/v1/auth/accept-invite' },
  { method: 'POST', url: '/api/v1/google/callback' },
  { method: 'POST', url: '/api/v1/login' },
];

function isLoginRoute(method: string, url: string): boolean {
  return LOGIN_ROUTES.some(
    (route) => route.method === method && route.url === url,
  );
}

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
                isLoginRoute(httpReq.method, httpReq.url) &&
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
