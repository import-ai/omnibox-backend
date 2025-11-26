import otelSDK from './tracing';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from 'omniboxd/app/app.module';
import { configureApp } from 'omniboxd/app/app-config';
import { NativeWsGateway } from 'omniboxd/native-ws/native-ws.gateway';

async function bootstrap() {
  // Start OpenTelemetry SDK before creating the NestJS app
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
  const port = parseInt(configService.get('OBB_PORT', '8000'));

  await app.listen(port);

  // Initialize native WebSocket gateway
  const nativeWsGateway = app.get(NativeWsGateway);
  const httpServer = app.getHttpServer();
  nativeWsGateway.initialize(httpServer);
}

bootstrap().catch(console.error);
