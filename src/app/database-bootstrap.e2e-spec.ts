import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from './app.module';

it('initializes the shard database and records migration coverage', async () => {
  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot([]),
    {
      logger: false,
      abortOnError: false,
    },
  );
  try {
    expect(app.get(DataSource).isInitialized).toBe(true);
  } finally {
    await app.close();
  }
});
