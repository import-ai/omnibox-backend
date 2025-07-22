import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from 'omnibox-backend/mail/mail.module';
import { UserModule } from 'omnibox-backend/user/user.module';
import { AuthService } from 'omnibox-backend/auth/auth.service';
import { JwtStrategy } from 'omnibox-backend/auth/jwt.strategy';
import { JwtAuthGuard } from 'omnibox-backend/auth/jwt-auth.guard';
import { LocalStrategy } from 'omnibox-backend/auth/local.strategy';
import { AuthController } from 'omnibox-backend/auth/auth.controller';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { InternalAuthController } from 'omnibox-backend/auth/internal.auth.controller';
import { NamespacesModule } from 'omnibox-backend/namespaces/namespaces.module';
import { GroupsModule } from 'omnibox-backend/groups/groups.module';
import { PermissionsModule } from 'omnibox-backend/permissions/permissions.module';
import { WechatService } from 'omnibox-backend/auth/wechat.service';
import { WechatController } from 'omnibox-backend/auth/wechat.controller';

@Module({
  exports: [AuthService, WechatService],
  controllers: [AuthController, InternalAuthController, WechatController],
  providers: [
    AuthService,
    WechatService,
    JwtStrategy,
    LocalStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  imports: [
    UserModule,
    MailModule,
    PassportModule,
    NamespacesModule,
    GroupsModule,
    PermissionsModule,
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
