import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'omniboxd/resources/resources.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourcesController } from 'omniboxd/resources/resources.controller';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { InternalResourcesController } from 'omniboxd/resources/internal.resource.controller';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { FileResourcesController } from 'omniboxd/resources/file-resources.controller';
import { MinioModule } from 'omniboxd/minio/minio.module';

@Module({
  exports: [ResourcesService],
  providers: [ResourcesService],
  controllers: [
    ResourcesController,
    InternalResourcesController,
    FileResourcesController,
  ],
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Task]),
    PermissionsModule,
    MinioModule,
  ],
})
export class ResourcesModule {}
