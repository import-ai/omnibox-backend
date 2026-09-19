import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from 'omniboxd/files/files.module';
import { StorageUsagesModule } from 'omniboxd/storage-usages/storage-usages.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { User } from 'omniboxd/user/entities/user.entity';

import { Resource } from './entities/resource.entity';
import { ResourceRevision } from './entities/resource-revision.entity';
import { ResourceRevisionService } from './resource-revision.service';
import { ResourcesService } from './resources.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource, ResourceRevision, User]),
    TasksModule,
    FilesModule,
    StorageUsagesModule,
    TagModule,
  ],
  providers: [ResourcesService, ResourceRevisionService],
  exports: [ResourcesService, ResourceRevisionService],
})
export class ResourcesModule {}
