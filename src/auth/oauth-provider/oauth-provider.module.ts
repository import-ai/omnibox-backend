import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthAuthorizationCode } from './entities/oauth-authorization-code.entity';
import { OAuthAccessToken } from './entities/oauth-access-token.entity';
import { OAuthPairwiseSubject } from './entities/oauth-pairwise-subject.entity';
import { OAuthClientService } from './oauth-client.service';
import { OAuthProviderService } from './oauth-provider.service';
import { PairwiseSubjectService } from './pairwise-subject.service';
import {
  OAuthProviderController,
  OAuthClientController,
} from './oauth-provider.controller';
import { UserModule } from 'omniboxd/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient,
      OAuthAuthorizationCode,
      OAuthAccessToken,
      OAuthPairwiseSubject,
    ]),
    UserModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('OBB_JWT_SECRET'),
      }),
    }),
  ],
  controllers: [OAuthProviderController, OAuthClientController],
  providers: [OAuthClientService, OAuthProviderService, PairwiseSubjectService],
  exports: [OAuthClientService, OAuthProviderService, PairwiseSubjectService],
})
export class OAuthProviderModule {}
