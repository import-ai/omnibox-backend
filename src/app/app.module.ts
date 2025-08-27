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
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { SnakeCaseInterceptor } from 'omniboxd/interceptor/snake-case';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { GroupsModule } from 'omniboxd/groups/groups.module';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { MessagesModule } from 'omniboxd/messages/messages.module';
import { SearchModule } from 'omniboxd/search/search.module';
import { InvitationsModule } from 'omniboxd/invitations/invitations.module';
import { AccessLogMiddleware } from 'omniboxd/middlewares/access-log.middleware';
import { UserOptions1751904560034 } from 'omniboxd/migrations/1751904560034-user-options';
import { UserBindings1752652489640 } from 'omniboxd/migrations/1752652489640-user-bindings.ts';
import { Tags1751905414493 } from 'omniboxd/migrations/1751905414493-tags';
import { Init1751900000000 } from 'omniboxd/migrations/1751900000000-init';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { NullUserEmail1752814358259 } from 'omniboxd/migrations/1752814358259-null-user-email';
import { AttachmentsModule } from 'omniboxd/attachments/attachments.module';
import { Shares1753866547335 } from 'omniboxd/migrations/1753866547335-shares';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { SharedResourcesModule } from 'omniboxd/shared-resources/shared-resources.module';
import { ApiKeys1754550165406 } from 'omniboxd/migrations/1754550165406-api-keys';
import { ResourceAttachments1755059371000 } from 'omniboxd/migrations/1755059371000-resource-attachments';
import { AddTagIdsToResources1755248141570 } from 'omniboxd/migrations/1755248141570-add-tag-ids-to-resources';
import { TelemetryModule } from 'omniboxd/telemetry';
import { CleanResourceNames1755396702021 } from 'omniboxd/migrations/1755396702021-clean-resource-names';
import { UpdateAttachmentUrls1755499552000 } from 'omniboxd/migrations/1755499552000-update-attachment-urls';
import { ScanResourceAttachments1755504936756 } from 'omniboxd/migrations/1755504936756-scan-resource-attachments';
import { SharesAllResources1754471311959 } from 'omniboxd/migrations/1754471311959-shares-all-resources';
import { ResourcesModule } from 'omniboxd/resources/resources.module';

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
        TelemetryModule,
        TagModule,
        MailModule,
        AuthModule,
        UserModule,
        APIKeyModule,
        NamespacesModule,
        NamespaceResourcesModule,
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
        SharesModule,
        SharedResourcesModule,
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
            url: config.get('OBB_POSTGRES_URL'),
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
              Shares1753866547335,
              ApiKeys1754550165406,
              ResourceAttachments1755059371000,
              AddTagIdsToResources1755248141570,
              CleanResourceNames1755396702021,
              UpdateAttachmentUrls1755499552000,
              ScanResourceAttachments1755504936756,
              SharesAllResources1754471311959,
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
    consumer.apply(AccessLogMiddleware).forRoutes('*');
  }
}
