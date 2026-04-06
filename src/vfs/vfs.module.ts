import { Module } from '@nestjs/common';
import { VFSController } from './vfs.controller';
import { VFSService } from './vfs.service';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { FilesModule } from 'omniboxd/files/files.module';
import { I18nModule } from 'nestjs-i18n';
import { InternalVFSController } from 'omniboxd/vfs/internal.vfs.controller';

@Module({
  exports: [VFSService],
  providers: [VFSService],
  controllers: [VFSController, InternalVFSController],
  imports: [
    NamespaceResourcesModule,
    TagModule,
    NamespacesModule,
    ResourcesModule,
    FilesModule,
    I18nModule,
  ],
})
export class VFSModule {}
