import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagModule } from 'src/tag/tag.module';
// import { CacheModule } from '@nestjs/cache-manager';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';
import { AppController } from 'src/app/app.controller';
import { MailModule } from 'src/mail/mail.module';
import { TasksModule } from 'src/tasks/tasks.module';
import { WizardModule } from 'src/wizard/wizard.module';
import { APIKeyModule } from 'src/api-key/api-key.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ResourcesModule } from 'src/resources/resources.module';
import { SnakeCaseInterceptor } from 'src/interceptor/snake-case';
import { NamespacesModule } from 'src/namespaces/namespaces.module';
import { PermissionsModule } from 'src/permissions/permissions.module';
import { GroupsModule } from 'src/groups/groups.module';
import { ConversationsModule } from 'src/conversations/conversations.module';
import { MessagesModule } from 'src/messages/messages.module';
import { SearchModule } from 'src/search/search.module';
import { InvitationsModule } from 'src/invitations/invitations.module';
import { LoggerMiddleware } from './logger.middleware';
import { UserOptions1751904560034 } from 'src/migrations/1751904560034-user-options';
import { Tags1751905414493 } from 'src/migrations/1751905414493-tags';
import { Init1751900000000 } from 'src/migrations/1751900000000-init';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

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
          UserOptions1751904560034,
          Tags1751905414493,
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
