import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceAttachmentsService } from './resource-attachments.service';
import { ResourceAttachment } from 'omniboxd/attachments/entities/resource-attachment.entity';

@Module({
  exports: [ResourceAttachmentsService],
  providers: [ResourceAttachmentsService],
  imports: [TypeOrmModule.forFeature([ResourceAttachment])],
})
export class ResourceAttachmentsModule {}
