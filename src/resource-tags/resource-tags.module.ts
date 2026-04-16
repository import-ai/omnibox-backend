import { Module } from '@nestjs/common';
import { ResourceTagsService } from 'omniboxd/resource-tags/resource-tags.service';
import { TagModule } from 'omniboxd/tag/tag.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { InternalTagController } from 'omniboxd/resource-tags/internal.tag.controller';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';

@Module({
  providers: [ResourceTagsService],
  controllers: [InternalTagController],
  imports: [TagModule, ResourcesModule, NamespaceResourcesModule],
})
export class ResourceTagsModule {}
