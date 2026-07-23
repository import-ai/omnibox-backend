import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKeyController } from 'omniboxd/api-key/api-key.controller';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { Applications } from 'omniboxd/applications/applications.entity';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';

import { APIKey } from './api-key.entity';

@Module({
  providers: [APIKeyService],
  controllers: [APIKeyController],
  exports: [APIKeyService],
  imports: [
    TypeOrmModule.forFeature([APIKey, Applications]),
    PermissionsModule,
    NamespacesModule,
  ],
})
export class APIKeyModule {}
