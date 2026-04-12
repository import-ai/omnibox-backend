import { Module } from '@nestjs/common';
import { TagModule } from 'omniboxd/tag/tag.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { InternalVfsTagsController } from 'omniboxd/vfs-tags/internal.vfs-tags.controller';
import { VFSModule } from 'omniboxd/vfs/vfs.module';
import { VfsTagsService } from 'omniboxd/vfs-tags/vfs-tags.service';

@Module({
  providers: [VfsTagsService],
  controllers: [InternalVfsTagsController],
  imports: [TagModule, VFSModule, ResourcesModule],
})
export class VfsTagsModule {}
