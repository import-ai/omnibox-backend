import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app/app.module';
import { LogLevel } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule.forRoot([]), {
    cors: true,
    bodyParser: true,
    abortOnError: false,
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  const configService = app.get(ConfigService);

  const logLevels: LogLevel[] = configService
    .get('OBB_LOG_LEVELS', 'error,warn,log')
    .split(',');
  app.useLogger(logLevels);

  await app.listen(parseInt(configService.get('OBB_PORT', '8000')));
}

bootstrap().catch(console.error);
