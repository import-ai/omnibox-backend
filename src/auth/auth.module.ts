import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from 'src/mail/mail.module';
import { UserModule } from 'src/user/user.module';
import { AuthService } from 'src/auth/auth.service';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { LocalStrategy } from 'src/auth/local.strategy';
import { AuthController } from 'src/auth/auth.controller';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { InternalAuthController } from 'src/auth/internal.auth.controller';
import { NamespacesModule } from 'src/namespaces/namespaces.module';
import { GroupsModule } from 'src/groups/groups.module';
import { PermissionsModule } from 'src/permissions/permissions.module';
import { WechatService } from 'src/auth/wechat.service';
import { WechatController } from 'src/auth/wechat.controller';

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
