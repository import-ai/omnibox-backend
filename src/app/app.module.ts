import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { CacheModule } from '@nestjs/cache-manager';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';
import { AppController } from './app.controller';
import { MailModule } from 'src/mail/mail.module';
import { TasksModule } from 'src/tasks/tasks.module';
import { WizardModule } from 'src/wizard/wizard.module';
import { APIKeyModule } from 'src/api-key/api-key.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserRoleModule } from 'src/user-role/user-role.module';
import { ResourcesModule } from 'src/resources/resources.module';
import { SnakeCaseInterceptor } from 'src/interceptor/snake-case';
import { NamespacesModule } from 'src/namespaces/namespaces.module';
import { NamespaceMembersModule } from 'src/namespace-members/namespace-members.module';

@Module({
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: SnakeCaseInterceptor,
    },
  ],
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
    }),
    MailModule,
    AuthModule,
    UserModule,
    APIKeyModule,
    UserRoleModule,
    NamespacesModule,
    NamespaceMembersModule,
    ResourcesModule,
    TasksModule,
    WizardModule,
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
        host: config.get('OBB_DB_HOST', 'postgres'),
        port: config.get('OBB_DB_PORT', 5432),
        database: config.get('OBB_DB_DATABASE', 'omnibox'),
        username: config.get('OBB_DB_USERNAME', 'omnibox'),
        password: config.get('OBB_DB_PASSWORD', 'omnibox'),
        logging: config.get('OBB_DB_LOGGING') === 'true',
        synchronize: config.get('OBB_DB_SYNC') === 'true',
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class AppModule {}
