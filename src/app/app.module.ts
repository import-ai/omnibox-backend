import { Module } from '@nestjs/common';
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
import { NamespacesModule } from 'src/namespaces/namespaces.module';

@Module({
  controllers: [AppController],
  imports: [
    MailModule,
    AuthModule,
    UserModule,
    APIKeyModule,
    UserRoleModule,
    NamespacesModule,
    ResourcesModule,
    TasksModule,
    WizardModule,
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
