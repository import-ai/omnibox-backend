import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthPairwiseSubject } from './entities/oauth-pairwise-subject.entity';
import { OAuthClientService } from './oauth-client.service';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthTokenStoreService } from './oauth-token-store.service';
import { PairwiseSubjectService } from './pairwise-subject.service';
import {
  OAuthProviderController,
  OAuthClientController,
} from './oauth-provider.controller';
import { UserModule } from 'omniboxd/user/user.module';
import { CacheService } from 'omniboxd/common/cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OAuthClient, OAuthPairwiseSubject]),
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
  providers: [
    OAuthClientService,
    OAuthProviderService,
    OAuthTokenStoreService,
    PairwiseSubjectService,
    CacheService,
  ],
  exports: [OAuthClientService, OAuthProviderService, PairwiseSubjectService],
})
export class OAuthProviderModule {}
