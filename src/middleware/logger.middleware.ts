import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger();

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const url: string = req.originalUrl;
      const status = res.statusCode;

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
        duration: `${duration}ms`,
        requestId: req.headers['x-request-id'] || undefined,
      };
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
