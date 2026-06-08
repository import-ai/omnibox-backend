import { Module } from '@nestjs/common';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { InternalTagController } from 'omniboxd/resource-tags/internal.tag.controller';
import { ResourceTagsService } from 'omniboxd/resource-tags/resource-tags.service';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { TagModule } from 'omniboxd/tag/tag.module';

@Module({
  providers: [ResourceTagsService],
  controllers: [InternalTagController],
  imports: [TagModule, ResourcesModule, NamespaceResourcesModule],
})
export class ResourceTagsModule {}
