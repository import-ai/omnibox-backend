import { ConsoleLogger, INestApplication, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';

export function configureApp(app: INestApplication): INestApplication {
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser());

  const configService = app.get(ConfigService);
  const logLevels: LogLevel[] = configService
    .get('OBB_LOG_LEVELS', 'error,warn,log')
    .split(',');
  const logger = new ConsoleLogger({ json: true, logLevels });
  app.useLogger(logger);

  app.useGlobalPipes(new I18nValidationPipe());
  app.useGlobalFilters(
    new I18nValidationExceptionFilter({
      detailedErrors: false,
    }),
  );

  return app;
}
