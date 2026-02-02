import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceAttachmentsService } from './resource-attachments.service';
import { ResourceAttachment } from 'omniboxd/attachments/entities/resource-attachment.entity';
import { StorageUsagesModule } from 'omniboxd/storage-usages/storage-usages.module';
import { S3Module } from 'omniboxd/s3/s3.module';
import { Resource } from 'omniboxd/resources/entities/resource.entity';

@Module({
  exports: [ResourceAttachmentsService],
  providers: [ResourceAttachmentsService],
  imports: [
    TypeOrmModule.forFeature([ResourceAttachment, Resource]),
    StorageUsagesModule,
    S3Module,
  ],
})
export class ResourceAttachmentsModule {}
