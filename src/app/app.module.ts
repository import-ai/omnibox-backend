import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { SerializerInterceptor } from 'omniboxd/interceptor/serializer.interceptor';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagModule } from 'omniboxd/tag/tag.module';
import { CacheModule } from '@nestjs/cache-manager';
import { AuthModule } from 'omniboxd/auth/auth.module';
import { UserModule } from 'omniboxd/user/user.module';
import { AppController } from 'omniboxd/app/app.controller';
import { MailModule } from 'omniboxd/mail/mail.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { WizardModule } from 'omniboxd/wizard/wizard.module';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  I18nValidationExceptionFilter,
  I18nValidationPipe,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';
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
import { SeoModule } from 'omniboxd/seo/seo.module';
import { CleanResourceNames1755396702021 } from 'omniboxd/migrations/1755396702021-clean-resource-names';
import { UpdateAttachmentUrls1755499552000 } from 'omniboxd/migrations/1755499552000-update-attachment-urls';
import { ScanResourceAttachments1755504936756 } from 'omniboxd/migrations/1755504936756-scan-resource-attachments';
import { SharesAllResources1754471311959 } from 'omniboxd/migrations/1754471311959-shares-all-resources';
import { Applications1756914379375 } from 'omniboxd/migrations/1756914379375-applications';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { TraceModule } from 'omniboxd/trace/trace.module';
import { ApplicationsModule } from 'omniboxd/applications/applications.module';
import { UserInterceptor } from 'omniboxd/interceptor/user.interceptor';
import { WebSocketModule } from 'omniboxd/websocket/websocket.module';
import { NullableUserId1757844448000 } from 'omniboxd/migrations/1757844448000-nullable-user-id';
import { AddShareIdToConversations1757844449000 } from 'omniboxd/migrations/1757844449000-add-share-id-to-conversations';
import { ShareUser1760171824000 } from 'omniboxd/migrations/1760171824000-share-user';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { CacheableMemory } from 'cacheable';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { Files1761556143000 } from 'omniboxd/migrations/1761556143000-files';
import { FilesModule } from 'omniboxd/files/files.module';
import { AddFileIdToResources1761726974942 } from 'omniboxd/migrations/1761726974942-add-file-id-to-resources';
import { OpenAPIModule } from 'omniboxd/open-api/open-api.module';
import { UserUsernameNotNull1763533615604 } from 'omniboxd/migrations/1763533615604-user-username-not-null';
import { AddMetadataToUserBindings1762847685000 } from 'omniboxd/migrations/1762847685000-add-metadata-to-user-bindings';
import { Feedback1757100000000 } from 'omniboxd/migrations/1757100000000-feedback';
import { Orders1762847078000 } from 'omniboxd/migrations/1762847078000-orders';
import { Products1762847077000 } from 'omniboxd/migrations/1762847077000-products';

@Module({})
export class AppModule implements NestModule {
  static forRoot(extraMigrations: Array<new () => any> = []): DynamicModule {
    return {
      module: AppModule,
      controllers: [AppController],
      providers: [
        {
          provide: APP_PIPE,
          useValue: new I18nValidationPipe({
            transform: true,
            // whitelist: true,
            // forbidNonWhitelisted: true,
          }),
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: SnakeCaseInterceptor,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: SerializerInterceptor,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: UserInterceptor,
        },
        {
          provide: APP_FILTER,
          useValue: new I18nValidationExceptionFilter({
            detailedErrors: false,
          }),
        },
      ],
      imports: [
        ConfigModule.forRoot({
          cache: true,
          isGlobal: true,
        }),
        I18nModule.forRoot({
          fallbackLanguage: 'en',
          loaderOptions: {
            path: path.resolve(__dirname, '../i18n/'),
            watch: true,
          },
          resolvers: [
            { use: QueryResolver, options: ['lang'] },
            new HeaderResolver(['x-lang']),
            AcceptLanguageResolver,
          ],
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
        SeoModule,
        TraceModule,
        ApplicationsModule,
        WebSocketModule,
        FilesModule,
        OpenAPIModule,
        CacheModule.registerAsync({
          isGlobal: true,
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const redisUrl = config.get<string>('OBB_REDIS_URL');

            return {
              stores: [
                new Keyv({
                  store: isEmpty(redisUrl)
                    ? new CacheableMemory({ ttl: 60000, lruSize: 5000 })
                    : new KeyvRedis(redisUrl),
                }),
              ],
            };
          },
        }),
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
              Applications1756914379375,
              NullableUserId1757844448000,
              AddShareIdToConversations1757844449000,
              ShareUser1760171824000,
              Files1761556143000,
              AddFileIdToResources1761726974942,
              UserUsernameNotNull1763533615604,
              AddMetadataToUserBindings1762847685000,
              Feedback1757100000000,
              Orders1762847078000,
              Products1762847077000,
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
