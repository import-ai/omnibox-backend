import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { SmartFolderConfig } from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFolderEntitlementsController } from 'omniboxd/smart-folders/smart-folder-entitlements.controller';
import { SMART_FOLDER_ENTITLEMENTS_PROVIDER } from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { SmartFolderEntitlementsService } from 'omniboxd/smart-folders/smart-folder-entitlements.service';
import { SmartFoldersController } from 'omniboxd/smart-folders/smart-folders.controller';
import { SmartFoldersRuleService } from 'omniboxd/smart-folders/smart-folders-rule.service';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';
import { TagModule } from 'omniboxd/tag/tag.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SmartFolderConfig, Resource]),
    NamespaceResourcesModule,
    NamespacesModule,
    NamespacesQuotaModule,
    PermissionsModule,
    ResourcesModule,
    TagModule,
  ],
  providers: [
    SmartFoldersService,
    SmartFoldersRuleService,
    {
      provide: SMART_FOLDER_ENTITLEMENTS_PROVIDER,
      useClass: SmartFolderEntitlementsService,
    },
  ],
  controllers: [SmartFolderEntitlementsController, SmartFoldersController],
  exports: [SMART_FOLDER_ENTITLEMENTS_PROVIDER],
})
export class SmartFoldersModule {}
