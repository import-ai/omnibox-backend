import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'src/resources/resources.entity';
import { ResourcesService } from 'src/resources/resources.service';
import { ResourcesController } from 'src/resources/resources.controller';
import { Task } from 'src/tasks/tasks.entity';
import { MinioService } from 'src/resources/minio/minio.service';
import { InternalResourcesController } from 'src/resources/internal.resource.controller';
import { PermissionsModule } from 'src/permissions/permissions.module';
import { FileResourcesController } from 'src/resources/file-resources.controller';
import { ResourceAttachmentsController } from 'src/resources/attachments/attachments.resources.controller';
import { ResourceAttachmentsService } from 'src/resources/attachments/attachments.resources.service';

@Module({
  exports: [ResourcesService, MinioService, ResourceAttachmentsService],
  providers: [ResourcesService, MinioService, ResourceAttachmentsService],
  controllers: [
    ResourcesController,
    InternalResourcesController,
    FileResourcesController,
    ResourceAttachmentsController,
  ],
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Task]),
    PermissionsModule,
  ],
})
export class ResourcesModule {}
