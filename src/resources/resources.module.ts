import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'omniboxd/resources/resources.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourcesController } from 'omniboxd/resources/resources.controller';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { InternalResourcesController } from 'omniboxd/resources/internal.resource.controller';
import { OpenResourcesController } from 'omniboxd/resources/open.resource.controller';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { FileResourcesController } from 'omniboxd/resources/file-resources.controller';
import { MinioModule } from 'omniboxd/minio/minio.module';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';

@Module({
  exports: [ResourcesService],
  providers: [ResourcesService],
  controllers: [
    ResourcesController,
    InternalResourcesController,
    OpenResourcesController,
    FileResourcesController,
  ],
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Task]),
    TypeOrmModule.forFeature([Namespace]),
    PermissionsModule,
    MinioModule,
  ],
})
export class ResourcesModule {}
