import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    AuthModule,
    UserModule,
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
    }),
    // CacheModule.registerAsync({
    //   imports: [ConfigModule],
    //   inject: [ConfigService],
    //   useFactory: (config: ConfigService) => ({
    //     store: 'redis',
    //     host: config.get('REDIS_URL'),
    //     port: config.get('REDIS_PORT'),
    //     ttl: config.get('REDIS_TTL'),
    //   }),
    // }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get('DB_PORT'),
        database: config.get('DB_DATABASE'),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        logging: config.get('DB_LOGGING'),
        synchronize: config.get('DB_SYNC'),
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class AppModule {}
