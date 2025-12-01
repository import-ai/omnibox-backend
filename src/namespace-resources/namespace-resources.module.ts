import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { NamespaceResourcesController } from 'omniboxd/namespace-resources/namespace-resources.controller';
import { PdfExportService } from 'omniboxd/namespace-resources/pdf-export.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { InternalResourcesController } from 'omniboxd/namespace-resources/internal.resource.controller';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { FileResourcesController } from 'omniboxd/namespace-resources/file-resources.controller';
import { S3Module } from 'omniboxd/s3/s3.module';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { ResourceAttachmentsModule } from 'omniboxd/resource-attachments/resource-attachments.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { FilesModule } from 'omniboxd/files/files.module';

@Module({
  exports: [NamespaceResourcesService],
  providers: [NamespaceResourcesService, PdfExportService],
  controllers: [
    NamespaceResourcesController,
    InternalResourcesController,
    FileResourcesController,
  ],
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Task]),
    TypeOrmModule.forFeature([Namespace]),
    TagModule,
    PermissionsModule,
    S3Module,
    TasksModule,
    ResourceAttachmentsModule,
    ResourcesModule,
    FilesModule,
  ],
})
export class NamespaceResourcesModule {}
