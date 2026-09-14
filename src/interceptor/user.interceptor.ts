import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { AttributionReporter } from 'omniboxd/attribution/attribution-reporter.service';
import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { Socket } from 'socket.io';

const LOGIN_ROUTES = [
  { method: 'GET', url: '/api/v1/wechat/callback' },
  { method: 'POST', url: '/api/v1/wechat/login/native' },
  { method: 'POST', url: '/api/v1/wechat/login/mini_program' },
  { method: 'POST', url: '/api/v1/auth/accept-invite' },
  { method: 'POST', url: '/api/v1/auth/verify-otp' },
  { method: 'POST', url: '/api/v1/auth/verify-magic' },
  { method: 'POST', url: '/api/v1/auth/verify-phone-otp' },
  { method: 'POST', url: '/api/v1/google/callback' },
  { method: 'POST', url: '/api/v1/google/mobile' },
  { method: 'POST', url: '/api/v1/apple/callback' },
  { method: 'POST', url: '/api/v1/apple/mobile' },
  { method: 'POST', url: '/api/v1/login' },
];

function isLoginRoute(method: string, url: string): boolean {
  const path = url.split('?')[0];
  return LOGIN_ROUTES.some(
    (route) => route.method === method && route.url === path,
  );
}

@Injectable()
export class UserInterceptor implements NestInterceptor {
  constructor(
    @Optional() private readonly attributionReporter?: AttributionReporter,
  ) {}

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
              this.attributionReporter?.reportActivity(userId);
            }
            span.end();
          }),
        );
      },
    );
  }
}
