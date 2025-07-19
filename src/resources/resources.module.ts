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
import { AttachmentsController } from 'src/resources/attachments/attachments.controller';
import { AttachmentsService } from 'src/resources/attachments/attachments.service';
import { ImageAttachmentsController } from 'src/resources/attachments/image.attachments.controller';

@Module({
  exports: [ResourcesService, MinioService, AttachmentsService],
  providers: [ResourcesService, MinioService, AttachmentsService],
  controllers: [
    ResourcesController,
    InternalResourcesController,
    FileResourcesController,
    AttachmentsController,
    ImageAttachmentsController,
  ],
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Task]),
    PermissionsModule,
  ],
})
export class ResourcesModule {}
