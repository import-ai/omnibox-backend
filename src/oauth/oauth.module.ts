import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OAuthService } from './oauth.service';
import { OAuthController } from './oauth.controller';
import { InternalOAuthController } from './internal.oauth.controller';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthAuthorizationCode } from './entities/oauth-authorization-code.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import { UserModule } from 'omniboxd/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient,
      OAuthToken,
      OAuthAuthorizationCode,
      User,
    ]),
    UserModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('OBB_JWT_SECRET'),
        signOptions: { expiresIn: config.get('OBB_JWT_EXPIRE', '2678400s') },
      }),
    }),
  ],
  controllers: [OAuthController, InternalOAuthController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
