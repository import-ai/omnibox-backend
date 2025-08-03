import { ConsoleLogger, INestApplication, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import { Handler } from 'express';

export function configureApp(
  app: INestApplication,
  handlers?: Handler[],
): INestApplication {
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  for (const handler of handlers || []) {
    app.use(handler);
  }

  const configService = app.get(ConfigService);
  const logLevels: LogLevel[] = configService
    .get('OBB_LOG_LEVELS', 'error,warn,log')
    .split(',');
  const logger = new ConsoleLogger({ json: true, logLevels });
  app.useLogger(logger);
  return app;
}
