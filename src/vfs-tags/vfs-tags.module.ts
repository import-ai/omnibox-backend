import { Module } from '@nestjs/common';
import { TagModule } from 'omniboxd/tag/tag.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { InternalVfsTagsController } from 'omniboxd/vfs-tags/internal.vfs-tags.controller';
import { VfsModule } from 'omniboxd/vfs/vfs.module';
import { VfsTagsService } from 'omniboxd/vfs-tags/vfs-tags.service';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';

@Module({
  providers: [VfsTagsService],
  controllers: [InternalVfsTagsController],
  imports: [TagModule, VfsModule, ResourcesModule, NamespacesQuotaModule],
})
export class VfsTagsModule {}
