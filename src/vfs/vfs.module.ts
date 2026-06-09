import { Module } from '@nestjs/common';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { SmartFoldersModule } from 'omniboxd/smart-folders/smart-folders.module';
import { InternalVfsController } from 'omniboxd/vfs/internal.vfs.controller';

import { VfsService } from './vfs.service';

@Module({
  exports: [VfsService],
  providers: [VfsService],
  controllers: [InternalVfsController],
  imports: [
    NamespaceResourcesModule,
    NamespacesModule,
    NamespacesQuotaModule,
    ResourcesModule,
    SmartFoldersModule,
  ],
})
export class VfsModule {}
