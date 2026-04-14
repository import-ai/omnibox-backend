import { Module } from '@nestjs/common';
import { VfsService } from './vfs.service';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { InternalVfsController } from 'omniboxd/vfs/internal.vfs.controller';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';

@Module({
  exports: [VfsService],
  providers: [VfsService],
  controllers: [InternalVfsController],
  imports: [NamespaceResourcesModule, NamespacesModule, NamespacesQuotaModule],
})
export class VfsModule {}
