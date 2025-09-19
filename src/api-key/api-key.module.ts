import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKey } from './api-key.entity';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { APIKeyController } from 'omniboxd/api-key/api-key.controller';
import { OpenAPIKeyController } from 'omniboxd/api-key/open.api-key.controller';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { Applications } from 'omniboxd/applications/applications.entity';
import { UserModule } from 'omniboxd/user/user.module';

@Module({
  providers: [APIKeyService],
  controllers: [APIKeyController, OpenAPIKeyController],
  exports: [APIKeyService],
  imports: [
    TypeOrmModule.forFeature([APIKey, Applications]),
    PermissionsModule,
    NamespacesModule,
    UserModule,
  ],
})
export class APIKeyModule {}
