import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from 'omniboxd/files/files.module';
import { ResourceSortPreference } from 'omniboxd/namespace-resources/entities/resource-sort-preference.entity';
import { FileResourcesController } from 'omniboxd/namespace-resources/file-resources.controller';
import { InternalResourcesController } from 'omniboxd/namespace-resources/internal.resource.controller';
import { NamespaceResourcesController } from 'omniboxd/namespace-resources/namespace-resources.controller';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { OpenResourcesService } from 'omniboxd/namespace-resources/open-resources.service';
import { ResourceRetryService } from 'omniboxd/namespace-resources/resource-retry.service';
import { ResourceSortPreferenceController } from 'omniboxd/namespace-resources/resource-sort-preference.controller';
import { ResourceSortPreferenceService } from 'omniboxd/namespace-resources/resource-sort-preference.service';
import { ResourceSortingService } from 'omniboxd/namespace-resources/resource-sorting.service';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourceAttachmentsModule } from 'omniboxd/resource-attachments/resource-attachments.module';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { S3Module } from 'omniboxd/s3/s3.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TasksModule } from 'omniboxd/tasks/tasks.module';

@Module({
  exports: [
    NamespaceResourcesService,
    OpenResourcesService,
    ResourceSortPreferenceService,
  ],
  providers: [
    NamespaceResourcesService,
    OpenResourcesService,
    ResourceSortPreferenceService,
    ResourceSortingService,
    ResourceRetryService,
  ],
  controllers: [
    NamespaceResourcesController,
    ResourceSortPreferenceController,
    InternalResourcesController,
    FileResourcesController,
  ],
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Task]),
    TypeOrmModule.forFeature([Namespace]),
    TypeOrmModule.forFeature([NamespaceMember]),
    TypeOrmModule.forFeature([ResourceSortPreference]),
    TagModule,
    PermissionsModule,
    S3Module,
    TasksModule,
    ResourceAttachmentsModule,
    ResourcesModule,
    FilesModule,
    NamespacesQuotaModule,
  ],
})
export class NamespaceResourcesModule {}
