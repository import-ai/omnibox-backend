import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKeyController } from 'omniboxd/api-key/api-key.controller';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { Applications } from 'omniboxd/applications/applications.entity';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { OpenAPIQuotaModule } from 'omniboxd/open-api/open-api-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { UserModule } from 'omniboxd/user/user.module';

import { APIKey } from './api-key.entity';

@Module({
  providers: [APIKeyService],
  controllers: [APIKeyController],
  exports: [APIKeyService],
  imports: [
    TypeOrmModule.forFeature([APIKey, Applications]),
    PermissionsModule,
    ResourcesModule,
    NamespacesModule,
    NamespacesQuotaModule,
    OpenAPIQuotaModule,
    UserModule,
  ],
})
export class APIKeyModule {}
