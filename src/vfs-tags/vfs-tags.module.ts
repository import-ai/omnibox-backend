import { Module } from '@nestjs/common';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { VfsModule } from 'omniboxd/vfs/vfs.module';
import { InternalVfsTagsController } from 'omniboxd/vfs-tags/internal.vfs-tags.controller';
import { VfsTagsService } from 'omniboxd/vfs-tags/vfs-tags.service';

@Module({
  providers: [VfsTagsService],
  controllers: [InternalVfsTagsController],
  imports: [TagModule, VfsModule, ResourcesModule, NamespacesQuotaModule],
})
export class VfsTagsModule {}
