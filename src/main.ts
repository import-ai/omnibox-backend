import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app/app.module';
import { ConsoleLogger, LogLevel } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule.forRoot([]), {
    cors: true,
    bodyParser: true,
    abortOnError: false,
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser());

  const configService = app.get(ConfigService);

  const logLevels: LogLevel[] = configService
    .get('OBB_LOG_LEVELS', 'error,warn,log')
    .split(',');
  const logger = new ConsoleLogger({ json: true, logLevels });
  app.useLogger(logger);

  await app.listen(parseInt(configService.get('OBB_PORT', '8000')));
}

bootstrap().catch(console.error);
