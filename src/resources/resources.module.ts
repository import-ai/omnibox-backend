import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'omnibox-backend/resources/resources.entity';
import { ResourcesService } from 'omnibox-backend/resources/resources.service';
import { ResourcesController } from 'omnibox-backend/resources/resources.controller';
import { Task } from 'omnibox-backend/tasks/tasks.entity';
import { MinioService } from 'omnibox-backend/resources/minio/minio.service';
import { InternalResourcesController } from 'omnibox-backend/resources/internal.resource.controller';
import { PermissionsModule } from 'omnibox-backend/permissions/permissions.module';
import { FileResourcesController } from 'omnibox-backend/resources/file-resources.controller';

@Module({
  exports: [ResourcesService, MinioService],
  providers: [ResourcesService, MinioService],
  controllers: [
    ResourcesController,
    InternalResourcesController,
    FileResourcesController,
  ],
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Task]),
    PermissionsModule,
  ],
})
export class ResourcesModule {}
