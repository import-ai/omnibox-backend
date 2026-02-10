import getTracingSDK from './tracing';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from 'omniboxd/app/app.module';
import { configureApp } from 'omniboxd/app/app-config';

const serviceName = 'omnibox-backend';

async function bootstrap() {
  // Start OpenTelemetry SDK before creating the NestJS app
  const otelSDK = getTracingSDK({ serviceName });
  if (otelSDK) {
    otelSDK.start();
  }
  const app = await NestFactory.create(AppModule.forRoot([]), {
    cors: true,
    bodyParser: true,
    abortOnError: false,
  });

  configureApp(app);

  const configService = app.get(ConfigService);
  await app.listen(parseInt(configService.get('OBB_PORT', '8000')));
}

bootstrap().catch(console.error);
