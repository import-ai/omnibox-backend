import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from 'omniboxd/user/user.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OAuthController } from 'omniboxd/oauth2/oauth.controller';
import { OAuthService } from 'omniboxd/oauth2/oauth.service';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        global: true,
        secret: config.get('OBB_JWT_SECRET'),
        signOptions: { expiresIn: config.get('OBB_JWT_EXPIRE') },
      }),
    }),
  ],
  controllers: [OAuthController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
