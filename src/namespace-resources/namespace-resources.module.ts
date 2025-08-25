import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'omniboxd/namespace-resources/namespace-resources.entity';
import { ResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ResourcesController } from 'omniboxd/namespace-resources/namespace-resources.controller';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { InternalResourcesController } from 'omniboxd/namespace-resources/internal.resource.controller';
import { OpenResourcesController } from 'omniboxd/namespace-resources/open.resource.controller';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { FileResourcesController } from 'omniboxd/namespace-resources/file-resources.controller';
import { MinioModule } from 'omniboxd/minio/minio.module';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { ResourceAttachmentsModule } from 'omniboxd/resource-attachments/resource-attachments.module';

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
    TagModule,
    PermissionsModule,
    MinioModule,
    TasksModule,
    ResourceAttachmentsModule,
  ],
})
export class ResourcesModule {}
