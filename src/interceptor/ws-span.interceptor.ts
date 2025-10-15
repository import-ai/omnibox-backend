import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { trace, context } from '@opentelemetry/api';

@Injectable()
export class WsSpanInterceptor implements NestInterceptor {
  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const wsContext = executionContext.switchToWs();
    const messageName = wsContext.getPattern();
    const spanName = `SOCKET /api/v1/socket.io/wizard/${messageName}`;
    const tracer = trace.getTracer('ws-span-interceptor');
    return tracer.startActiveSpan(spanName, {}, context.active(), (span) => {
      return next.handle().pipe(finalize(() => span.end()));
    });
  }
}
