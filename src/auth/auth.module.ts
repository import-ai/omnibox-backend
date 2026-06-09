import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { APIKeyAuthGuard } from 'omniboxd/auth/api-key/api-key-auth.guard';
import { AppleController } from 'omniboxd/auth/apple/apple.controller';
import { AppleService } from 'omniboxd/auth/apple/apple.service';
import { AuthController } from 'omniboxd/auth/auth.controller';
import { AuthService } from 'omniboxd/auth/auth.service';
import { CookieAuthGuard } from 'omniboxd/auth/cookie/cookie-auth.guard';
import { GoogleController } from 'omniboxd/auth/google/google.controller';
import { GoogleService } from 'omniboxd/auth/google/google.service';
import { InternalAuthController } from 'omniboxd/auth/internal.auth.controller';
import { JwtStrategy } from 'omniboxd/auth/jwt.strategy';
import { JwtAuthGuard } from 'omniboxd/auth/jwt-auth.guard';
import { LocalStrategy } from 'omniboxd/auth/local.strategy';
import { OAuthProviderModule } from 'omniboxd/auth/oauth-provider/oauth-provider.module';
import { OtpService } from 'omniboxd/auth/otp.service';
import { SocialService } from 'omniboxd/auth/social.service';
import { WechatController } from 'omniboxd/auth/wechat/wechat.controller';
import { WechatService } from 'omniboxd/auth/wechat/wechat.service';
import { CacheService } from 'omniboxd/common/cache.service';
import { GroupsModule } from 'omniboxd/groups/groups.module';
import { MailModule } from 'omniboxd/mail/mail.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { OpenAPIQuotaGuard } from 'omniboxd/open-api/open-api-quota.guard';
import { OpenAPIQuotaModule } from 'omniboxd/open-api/open-api-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { SmsModule } from 'omniboxd/sms/sms.module';
import { User } from 'omniboxd/user/entities/user.entity';
import { UserModule } from 'omniboxd/user/user.module';

@Module({
  exports: [
    AuthService,
    WechatService,
    GoogleService,
    AppleService,
    SocialService,
    OAuthProviderModule,
  ],
  controllers: [
    AuthController,
    InternalAuthController,
    WechatController,
    GoogleController,
    AppleController,
  ],
  providers: [
    AuthService,
    SocialService,
    OtpService,
    WechatService,
    GoogleService,
    AppleService,
    JwtStrategy,
    LocalStrategy,
    CacheService,
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
      useClass: OpenAPIQuotaGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CookieAuthGuard,
    },
  ],
  imports: [
    TypeOrmModule.forFeature([User]),
    UserModule,
    MailModule,
    SmsModule,
    PassportModule,
    NamespacesModule,
    OpenAPIQuotaModule,
    GroupsModule,
    PermissionsModule,
    APIKeyModule,
    OAuthProviderModule,
    ResourcesModule,

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
