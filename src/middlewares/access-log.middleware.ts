import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TelemetryService } from 'omniboxd/telemetry';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class AccessLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger();

  constructor(private telemetryService: TelemetryService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] as string;

    // Create OpenTelemetry span for the HTTP request
    const span = this.telemetryService.createSpan(
      `HTTP ${req.method} ${req.route?.path || req.originalUrl}`,
      {
        'http.method': req.method,
        'http.url': req.originalUrl,
        'http.scheme': req.protocol,
        'http.host': req.get('host'),
        'http.user_agent': req.get('user-agent'),
        'request.id': requestId,
      },
      SpanKind.SERVER,
    );

    res.on('finish', () => {
      const duration = Date.now() - start;
      const url: string = req.originalUrl;
      const status = res.statusCode;
      const user = req.user as { id: string };

      let logLevel: 'info' | 'error' | 'warn' | 'debug' = 'info';
      if (status >= 500) {
        logLevel = 'error';
      } else if (status >= 400) {
        logLevel = 'warn';
      }
      if (logLevel === 'info') {
        if (url.startsWith('/api/v1/health')) {
          logLevel = 'debug';
        } else if (
          url.startsWith('/internal/api/v1/wizard/task') &&
          status === 204
        ) {
          logLevel = 'debug';
        }
      }

      const logMessage: Record<string, any> = {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration: duration,
        requestId: requestId,
        userId: user?.id,
      };

      // Add attributes to the span
      if (span) {
        span.setAttributes({
          'http.status_code': status,
          'http.response_size': res.get('content-length')
            ? parseInt(res.get('content-length')!)
            : 0,
          duration_ms: duration,
          'user.id': user?.id,
        });

        // Set span status based on HTTP status
        if (status >= 400) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `HTTP ${status}`,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        // Add span event for request completion
        span.addEvent('request.completed', {
          'http.status_code': status,
          duration_ms: duration,
        });

        span.end();
      }

      // Keep existing logging unchanged
      switch (logLevel) {
        case 'error':
          this.logger.error(logMessage);
          break;
        case 'warn':
          this.logger.warn(logMessage);
          break;
        case 'debug':
          this.logger.debug(logMessage);
          break;
        default:
          this.logger.log(logMessage);
      }
    });

    next();
  }
}
