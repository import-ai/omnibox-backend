import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagModule } from 'omniboxd/tag/tag.module';
// import { CacheModule } from '@nestjs/cache-manager';
import { AuthModule } from 'omniboxd/auth/auth.module';
import { UserModule } from 'omniboxd/user/user.module';
import { AppController } from 'omniboxd/app/app.controller';
import { MailModule } from 'omniboxd/mail/mail.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { WizardModule } from 'omniboxd/wizard/wizard.module';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { SnakeCaseInterceptor } from 'omniboxd/interceptor/snake-case';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { GroupsModule } from 'omniboxd/groups/groups.module';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { MessagesModule } from 'omniboxd/messages/messages.module';
import { SearchModule } from 'omniboxd/search/search.module';
import { InvitationsModule } from 'omniboxd/invitations/invitations.module';
import { LoggerMiddleware } from 'omniboxd/middleware/logger.middleware';
import { SeoMiddleware } from 'omniboxd/middleware/seo.middleware';
import { UserOptions1751904560034 } from 'omniboxd/migrations/1751904560034-user-options';
import { UserBindings1752652489640 } from 'omniboxd/migrations/1752652489640-user-bindings.ts';
import { Tags1751905414493 } from 'omniboxd/migrations/1751905414493-tags';
import { Init1751900000000 } from 'omniboxd/migrations/1751900000000-init';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { NullUserEmail1752814358259 } from 'omniboxd/migrations/1752814358259-null-user-email';
import { AttachmentsModule } from 'omniboxd/attachments/attachments.module';

@Module({})
export class AppModule implements NestModule {
  static forRoot(extraMigrations: Array<() => void>): DynamicModule {
    return {
      module: AppModule,
      controllers: [AppController],
      providers: [
        {
          provide: APP_INTERCEPTOR,
          useClass: SnakeCaseInterceptor,
        },
        {
          provide: APP_PIPE,
          useClass: ValidationPipe,
        },
      ],
      imports: [
        ConfigModule.forRoot({
          cache: true,
          isGlobal: true,
        }),
        TagModule,
        MailModule,
        AuthModule,
        UserModule,
        APIKeyModule,
        NamespacesModule,
        ResourcesModule,
        TasksModule,
        WizardModule,
        GroupsModule,
        PermissionsModule,
        ConversationsModule,
        MessagesModule,
        SearchModule,
        InvitationsModule,
        AttachmentsModule,
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
            maxQueryExecutionTime: config.get('OBB_DB_EXEC_TIME', 0),
            migrations: [
              Init1751900000000,
              Tags1751905414493,
              UserOptions1751904560034,
              UserBindings1752652489640,
              NullUserEmail1752814358259,
              ...extraMigrations,
            ],
            migrationsRun: true,
            namingStrategy: new SnakeNamingStrategy(),
          }),
        }),
      ],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware, SeoMiddleware).forRoutes('*');
  }
}
