import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceAttachmentsService } from './resource-attachments.service';
import { ResourceAttachment } from 'omniboxd/attachments/entities/resource-attachment.entity';
import { UsagesModule } from 'omniboxd/usages/usages.module';

@Module({
  exports: [ResourceAttachmentsService],
  providers: [ResourceAttachmentsService],
  imports: [TypeOrmModule.forFeature([ResourceAttachment]), UsagesModule],
})
export class ResourceAttachmentsModule {}
