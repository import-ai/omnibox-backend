import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';

import { MailModule } from 'omniboxd/mail/mail.module';
import { UserModule } from 'omniboxd/user/user.module';
import { AuthService } from 'omniboxd/auth/auth.service';
import { JwtStrategy } from 'omniboxd/auth/jwt.strategy';
import { JwtAuthGuard } from 'omniboxd/auth/jwt-auth.guard';
import { LocalStrategy } from 'omniboxd/auth/local.strategy';
import { AuthController } from 'omniboxd/auth/auth.controller';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { InternalAuthController } from 'omniboxd/auth/internal.auth.controller';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { GroupsModule } from 'omniboxd/groups/groups.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { WechatService } from 'omniboxd/auth/wechat/wechat.service';
import { WechatController } from 'omniboxd/auth/wechat/wechat.controller';
import { GoogleService } from 'omniboxd/auth/google/google.service';
import { GoogleController } from 'omniboxd/auth/google/google.controller';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { APIKeyAuthGuard } from 'omniboxd/auth/api-key/api-key-auth.guard';
import { CookieAuthGuard } from 'omniboxd/auth/cookie/cookie-auth.guard';

@Module({
  exports: [AuthService, WechatService, GoogleService],
  controllers: [
    AuthController,
    InternalAuthController,
    WechatController,
    GoogleController,
  ],
  providers: [
    AuthService,
    WechatService,
    GoogleService,
    JwtStrategy,
    LocalStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: APIKeyAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CookieAuthGuard,
    },
  ],
  imports: [
    UserModule,
    MailModule,
    PassportModule,
    NamespacesModule,
    GroupsModule,
    PermissionsModule,
    APIKeyModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        global: true,
        secret: config.get('OBB_JWT_SECRET'),
        signOptions: { expiresIn: config.get('OBB_JWT_EXPIRE', '2678400s') },
      }),
    }),
  ],
})
export class AuthModule {}
