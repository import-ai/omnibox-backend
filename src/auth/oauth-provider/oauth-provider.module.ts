import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'omniboxd/auth/auth.module';
import { CacheService } from 'omniboxd/common/cache.service';
import { UserModule } from 'omniboxd/user/user.module';

import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthPairwiseSubject } from './entities/oauth-pairwise-subject.entity';
import { OAuthClientService } from './oauth-client.service';
import {
  OAuthClientController,
  OAuthProviderController,
} from './oauth-provider.controller';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthTokenStoreService } from './oauth-token-store.service';
import { PairwiseSubjectService } from './pairwise-subject.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([OAuthClient, OAuthPairwiseSubject]),
    UserModule,
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
