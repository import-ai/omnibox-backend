import { Module } from '@nestjs/common';
import { VFSController } from './vfs.controller';
import { VFSService } from './vfs.service';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { InternalVFSController } from 'omniboxd/vfs/internal.vfs.controller';

@Module({
  exports: [VFSService],
  providers: [VFSService],
  controllers: [VFSController, InternalVFSController],
  imports: [NamespaceResourcesModule, NamespacesModule],
})
export class VFSModule {}
