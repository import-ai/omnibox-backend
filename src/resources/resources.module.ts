import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from './entities/resource.entity';
import { ResourcesService } from './resources.service';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { FilesModule } from 'omniboxd/files/files.module';
import { StorageUsagesModule } from 'omniboxd/storage-usages/storage-usages.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TasksModule,
    FilesModule,
    StorageUsagesModule,
  ],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
