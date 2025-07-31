import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from 'omniboxd/app/app.module';
import { configureApp } from 'omniboxd/app/app-config';

async function bootstrap() {
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
