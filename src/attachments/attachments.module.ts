import { Module } from '@nestjs/common';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { AttachmentsController } from 'omniboxd/attachments/attachments.controller';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { MinioModule } from 'omniboxd/minio/minio.module';
import { ResourceAttachmentsModule } from 'omniboxd/resource-attachments/resource-attachments.module';

@Module({
  exports: [AttachmentsService],
  providers: [AttachmentsService],
  controllers: [AttachmentsController],
  imports: [PermissionsModule, MinioModule, ResourceAttachmentsModule],
})
export class AttachmentsModule {}
