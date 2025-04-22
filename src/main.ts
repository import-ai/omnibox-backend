import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    abortOnError: false,
  });
  const configService = app.get(ConfigService);
  await app.listen(parseInt(configService.get('PORT', '3000')));
}

bootstrap().catch(console.error);
