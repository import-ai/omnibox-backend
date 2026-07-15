import { Module } from '@nestjs/common';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { InternalTagController } from 'omniboxd/resource-tags/internal.tag.controller';
import { ResourceTagsService } from 'omniboxd/resource-tags/resource-tags.service';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { TagModule } from 'omniboxd/tag/tag.module';

@Module({
  providers: [ResourceTagsService],
  controllers: [InternalTagController],
  imports: [
    TagModule,
    ResourcesModule,
    NamespaceResourcesModule,
    NamespacesQuotaModule,
    PermissionsModule,
  ],
})
export class ResourceTagsModule {}
