import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  I18nValidationExceptionFilter,
  I18nValidationPipe,
  QueryResolver,
} from 'nestjs-i18n';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { AppController } from 'omniboxd/app/app.controller';
import { AppConfigModule } from 'omniboxd/app-config/app-config.module';
import { ApplicationsModule } from 'omniboxd/applications/applications.module';
import { AttachmentsModule } from 'omniboxd/attachments/attachments.module';
import { AuthModule } from 'omniboxd/auth/auth.module';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { FeaturePreviewsModule } from 'omniboxd/feature-previews/feature-previews.module';
import { FilesModule } from 'omniboxd/files/files.module';
import { GroupsModule } from 'omniboxd/groups/groups.module';
import { SerializerInterceptor } from 'omniboxd/interceptor/serializer.interceptor';
import { SnakeCaseInterceptor } from 'omniboxd/interceptor/snake-case';
import { UserInterceptor } from 'omniboxd/interceptor/user.interceptor';
import { InvitationsModule } from 'omniboxd/invitations/invitations.module';
import { KafkaModule } from 'omniboxd/kafka/kafka.module';
import { MailModule } from 'omniboxd/mail/mail.module';
import { MessagesModule } from 'omniboxd/messages/messages.module';
import { AccessLogMiddleware } from 'omniboxd/middlewares/access-log.middleware';
import { Init1751900000000 } from 'omniboxd/migrations/1751900000000-init';
import { UserOptions1751904560034 } from 'omniboxd/migrations/1751904560034-user-options';
import { Tags1751905414493 } from 'omniboxd/migrations/1751905414493-tags';
import { UserBindings1752652489640 } from 'omniboxd/migrations/1752652489640-user-bindings.ts';
import { NullUserEmail1752814358259 } from 'omniboxd/migrations/1752814358259-null-user-email';
import { Shares1753866547335 } from 'omniboxd/migrations/1753866547335-shares';
import { SharesAllResources1754471311959 } from 'omniboxd/migrations/1754471311959-shares-all-resources';
import { ApiKeys1754550165406 } from 'omniboxd/migrations/1754550165406-api-keys';
import { ResourceAttachments1755059371000 } from 'omniboxd/migrations/1755059371000-resource-attachments';
import { AddTagIdsToResources1755248141570 } from 'omniboxd/migrations/1755248141570-add-tag-ids-to-resources';
import { CleanResourceNames1755396702021 } from 'omniboxd/migrations/1755396702021-clean-resource-names';
import { UpdateAttachmentUrls1755499552000 } from 'omniboxd/migrations/1755499552000-update-attachment-urls';
import { ScanResourceAttachments1755504936756 } from 'omniboxd/migrations/1755504936756-scan-resource-attachments';
import { Applications1756914379375 } from 'omniboxd/migrations/1756914379375-applications';
import { NullableUserId1757844448000 } from 'omniboxd/migrations/1757844448000-nullable-user-id';
import { AddShareIdToConversations1757844449000 } from 'omniboxd/migrations/1757844449000-add-share-id-to-conversations';
import { ShareUser1760171824000 } from 'omniboxd/migrations/1760171824000-share-user';
import { Files1761556143000 } from 'omniboxd/migrations/1761556143000-files';
import { AddFileIdToResources1761726974942 } from 'omniboxd/migrations/1761726974942-add-file-id-to-resources';
import { AddMetadataToUserBindings1762847685000 } from 'omniboxd/migrations/1762847685000-add-metadata-to-user-bindings';
import { UserUsernameNotNull1763533615604 } from 'omniboxd/migrations/1763533615604-user-username-not-null';
import { AddEnqueuedToTasks1765348624000 } from 'omniboxd/migrations/1765348624000-add-enqueued-to-tasks';
import { AddResourceIdToTasks1765443191000 } from 'omniboxd/migrations/1765443191000-add-resource-id-to-tasks';
import { AddNamespaceIdIndexToResources1766053289000 } from 'omniboxd/migrations/1766053289000-add-namespace-id-index-to-resources';
import { AddStatusToTasks1766127168000 } from 'omniboxd/migrations/1766127168000-add-status-to-tasks';
import { AddAdminRole1766339893375 } from 'omniboxd/migrations/1766339893375-add-admin-role';
import { AddPermanentDeletedAt1767441415360 } from 'omniboxd/migrations/1767441415360-add-permanent-deleted-at';
import { AddPhoneUniqueConstraint1768483850604 } from 'omniboxd/migrations/1768483850604-add-phone-unique-constraint';
import { StorageUsages1768556182000 } from 'omniboxd/migrations/1768556182000-storage-usages';
import { AddAttachmentSize1768560746946 } from 'omniboxd/migrations/1768560746946-add-attachment-size';
import { OAuthProvider1768569496828 } from 'omniboxd/migrations/1768569496828-oauth-provider';
import { AddInsufficientQuotaStatus1768569500000 } from 'omniboxd/migrations/1768569500000-add-insufficient-quota-status';
import { AddContentSizeToResources1769415718000 } from 'omniboxd/migrations/1769415718000-add-content-size-to-resources';
import { AddSizeToFiles1769415719000 } from 'omniboxd/migrations/1769415719000-add-size-to-files';
import { MakeSizeNullable1769478367000 } from 'omniboxd/migrations/1769478367000-make-size-nullable';
import { RenameVerifyCodeToKey1774965861436 } from 'omniboxd/migrations/1774965861436-rename-verify-code-to-key';
import { DeduplicateResourceNames1775666229211 } from 'omniboxd/migrations/1775666229211-deduplicate-resource-names';
import { AddNotifications1776070800000 } from 'omniboxd/migrations/1776070800000-add-notifications';
import { AddStatusEnqueuedIndexToTasks1776071000000 } from 'omniboxd/migrations/1776071000000-add-status-enqueued-index-to-tasks';
import { AddSmartFolders1779344088692 } from 'omniboxd/migrations/1779344088692-add-smart-folders';
import { AddLastHeartbeatToTasks1780652045516 } from 'omniboxd/migrations/1780652045516-add-last-heartbeat-to-tasks';
import { MigrateFileReaderTaskFunctions1781259717294 } from 'omniboxd/migrations/1781259717294-migrate-file-reader-task-functions';
import { AddWorkerIdToTasks1781511514000 } from 'omniboxd/migrations/1781511514000-add-worker-id-to-tasks';
import { AddNumSchedulesToTasks1784095735711 } from 'omniboxd/migrations/1784095735711-add-num-schedules-to-tasks';
import { BackfillUserEmailFromOauthBindings1784109716584 } from 'omniboxd/migrations/1784109716584-backfill-user-email-from-oauth-bindings';
import { FeaturePreviews1784521510168 } from 'omniboxd/migrations/1784521510168-feature-previews';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { NamespaceTasksModule } from 'omniboxd/namespace-tasks/namespace-tasks.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { NotificationsModule } from 'omniboxd/notifications/notifications.module';
import { OpenAPIModule } from 'omniboxd/open-api/open-api.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { PhoneModule } from 'omniboxd/phone/phone.module';
import { ResourceTagsModule } from 'omniboxd/resource-tags/resource-tags.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { SearchModule } from 'omniboxd/search/search.module';
import { SeoModule } from 'omniboxd/seo/seo.module';
import { SharedResourceTagsModule } from 'omniboxd/shared-resource-tags/shared-resource-tags.module';
import { SharedResourcesModule } from 'omniboxd/shared-resources/shared-resources.module';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { SmartFoldersModule } from 'omniboxd/smart-folders/smart-folders.module';
import { SubscribeMessageModule } from 'omniboxd/subscribe-message/subscribe-message.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { TelemetryModule } from 'omniboxd/telemetry';
import { TraceModule } from 'omniboxd/trace/trace.module';
import { UserModule } from 'omniboxd/user/user.module';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { WebSocketModule } from 'omniboxd/websocket/websocket.module';
import { WizardModule } from 'omniboxd/wizard/wizard.module';
import { WizardUrlProviderModule } from 'omniboxd/wizard-url-provider/wizard-url-provider.module';
import * as path from 'path';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

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
        ScheduleModule.forRoot(),
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
        KafkaModule,
        TagModule,
        ResourceTagsModule,
        MailModule,
        AuthModule,
        UserModule,
        APIKeyModule,
        NamespacesModule,
        NamespaceResourcesModule,
        NamespaceTasksModule,
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
        PhoneModule,
        TraceModule,
        ApplicationsModule,
        WebSocketModule,
        FilesModule,
        OpenAPIModule,
        SubscribeMessageModule,
        AppConfigModule,
        FeaturePreviewsModule,
        WizardUrlProviderModule,
        NotificationsModule,
        SmartFoldersModule,
        SharedResourceTagsModule,
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
              AddEnqueuedToTasks1765348624000,
              AddResourceIdToTasks1765443191000,
              AddAdminRole1766339893375,
              AddNamespaceIdIndexToResources1766053289000,
              AddStatusToTasks1766127168000,
              AddPermanentDeletedAt1767441415360,
              AddPhoneUniqueConstraint1768483850604,
              OAuthProvider1768569496828,
              StorageUsages1768556182000,
              AddAttachmentSize1768560746946,
              AddInsufficientQuotaStatus1768569500000,
              AddContentSizeToResources1769415718000,
              AddSizeToFiles1769415719000,
              MakeSizeNullable1769478367000,
              RenameVerifyCodeToKey1774965861436,
              AddNotifications1776070800000,
              AddStatusEnqueuedIndexToTasks1776071000000,
              DeduplicateResourceNames1775666229211,
              AddSmartFolders1779344088692,
              AddLastHeartbeatToTasks1780652045516,
              MigrateFileReaderTaskFunctions1781259717294,
              AddWorkerIdToTasks1781511514000,
              AddNumSchedulesToTasks1784095735711,
              BackfillUserEmailFromOauthBindings1784109716584,
              FeaturePreviews1784521510168,
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
