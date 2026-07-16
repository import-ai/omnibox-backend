import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { SmartFolderConfig } from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { InternalSmartFoldersController } from 'omniboxd/smart-folders/internal.smart-folders.controller';
import { SmartFolderEntitlementsController } from 'omniboxd/smart-folders/smart-folder-entitlements.controller';
import {
  SMART_FOLDER_ENTITLEMENTS_PROVIDER,
  SMART_FOLDERS_SERVICE,
} from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { SmartFolderEntitlementsService } from 'omniboxd/smart-folders/smart-folder-entitlements.service';
import { SmartFolderResourcesService } from 'omniboxd/smart-folders/smart-folder-resources.service';
import { SmartFoldersController } from 'omniboxd/smart-folders/smart-folders.controller';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';
import { SmartFoldersMatcherService } from 'omniboxd/smart-folders/smart-folders-matcher.service';
import { SmartFoldersQuotaService } from 'omniboxd/smart-folders/smart-folders-quota.service';
import { SmartFoldersRuleService } from 'omniboxd/smart-folders/smart-folders-rule.service';
import { SmartFoldersScopeService } from 'omniboxd/smart-folders/smart-folders-scope.service';
import { TagModule } from 'omniboxd/tag/tag.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SmartFolderConfig,
      Resource,
      Namespace,
      NamespaceMember,
    ]),
    NamespacesQuotaModule,
    PermissionsModule,
    ResourcesModule,
    TagModule,
  ],
  providers: [
    SmartFoldersService,
    SmartFoldersRuleService,
    SmartFoldersMatcherService,
    SmartFoldersScopeService,
    SmartFoldersQuotaService,
    SmartFolderResourcesService,
    {
      provide: SMART_FOLDER_ENTITLEMENTS_PROVIDER,
      useClass: SmartFolderEntitlementsService,
    },
    {
      provide: SMART_FOLDERS_SERVICE,
      useExisting: SmartFoldersService,
    },
  ],
  controllers: [
    InternalSmartFoldersController,
    SmartFolderEntitlementsController,
    SmartFoldersController,
  ],
  exports: [
    SmartFoldersService,
    SmartFoldersRuleService,
    SmartFoldersMatcherService,
    SMART_FOLDERS_SERVICE,
    SMART_FOLDER_ENTITLEMENTS_PROVIDER,
  ],
})
export class SmartFoldersModule {}
