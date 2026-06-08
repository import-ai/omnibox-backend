import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from 'omniboxd/files/files.module';
import { StorageUsagesModule } from 'omniboxd/storage-usages/storage-usages.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';

import { Resource } from './entities/resource.entity';
import { ResourcesService } from './resources.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TasksModule,
    FilesModule,
    StorageUsagesModule,
    TagModule,
  ],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
