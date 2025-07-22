import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagModule } from 'omnibox-backend/tag/tag.module';
// import { CacheModule } from '@nestjs/cache-manager';
import { AuthModule } from 'omnibox-backend/auth/auth.module';
import { UserModule } from 'omnibox-backend/user/user.module';
import { AppController } from 'omnibox-backend/app/app.controller';
import { MailModule } from 'omnibox-backend/mail/mail.module';
import { TasksModule } from 'omnibox-backend/tasks/tasks.module';
import { WizardModule } from 'omnibox-backend/wizard/wizard.module';
import { APIKeyModule } from 'omnibox-backend/api-key/api-key.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { UserOptions1751904560034 } from 'src/migrations/1751904560034-user-options';
import { UserBindings1752652489640 } from 'src/migrations/1752652489640-user-bindings.ts';
import { Tags1751905414493 } from 'src/migrations/1751905414493-tags';
import { Init1751900000000 } from 'src/migrations/1751900000000-init';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { NullUserEmail1752814358259 } from 'src/migrations/1752814358259-null-user-email';

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
        ],
        migrationsRun: true,
        namingStrategy: new SnakeNamingStrategy(),
      }),
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
