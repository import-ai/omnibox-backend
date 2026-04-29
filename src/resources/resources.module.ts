import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from './entities/resource.entity';
import { ResourceRevision } from './entities/resource-revision.entity';
import { ResourcesService } from './resources.service';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { FilesModule } from 'omniboxd/files/files.module';
import { StorageUsagesModule } from 'omniboxd/storage-usages/storage-usages.module';
import { ResourceRevisionsService } from './resource-revisions.service';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { ResourceRevisionRestoreService } from './resource-revision-restore.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource, ResourceRevision]),
    TasksModule,
    FilesModule,
    StorageUsagesModule,
    NamespacesQuotaModule,
  ],
  providers: [
    ResourcesService,
    ResourceRevisionsService,
    ResourceRevisionRestoreService,
  ],
  exports: [
    ResourcesService,
    ResourceRevisionsService,
    ResourceRevisionRestoreService,
  ],
})
export class ResourcesModule {}
