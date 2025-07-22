import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TagModule } from 'omnibox-backend/tag/tag.module';
import { AuthModule } from 'omnibox-backend/auth/auth.module';
import { UserModule } from 'omnibox-backend/user/user.module';
import { AppController } from 'omnibox-backend/app/app.controller';
import { MailModule } from 'omnibox-backend/mail/mail.module';
import { TasksModule } from 'omnibox-backend/tasks/tasks.module';
import { WizardModule } from 'omnibox-backend/wizard/wizard.module';
import { APIKeyModule } from 'omnibox-backend/api-key/api-key.module';
import { ConfigModule } from '@nestjs/config';
import { ResourcesModule } from 'omnibox-backend/resources/resources.module';
import { SnakeCaseInterceptor } from 'omnibox-backend/interceptor/snake-case';
import { NamespacesModule } from 'omnibox-backend/namespaces/namespaces.module';
import { PermissionsModule } from 'omnibox-backend/permissions/permissions.module';
import { GroupsModule } from 'omnibox-backend/groups/groups.module';
import { ConversationsModule } from 'omnibox-backend/conversations/conversations.module';
import { MessagesModule } from 'omnibox-backend/messages/messages.module';
import { SearchModule } from 'omnibox-backend/search/search.module';
import { InvitationsModule } from 'omnibox-backend/invitations/invitations.module';
import { LoggerMiddleware } from './logger.middleware';
import { DbModule } from './db.module';

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
    DbModule.forRoot([]),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
