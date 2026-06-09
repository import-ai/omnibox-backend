import { Module } from '@nestjs/common';
import { AttachmentsController } from 'omniboxd/attachments/attachments.controller';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { ShareAttachmentsController } from 'omniboxd/attachments/share-attachments.controller';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourceAttachmentsModule } from 'omniboxd/resource-attachments/resource-attachments.module';
import { S3Module } from 'omniboxd/s3/s3.module';
import { SharedResourcesModule } from 'omniboxd/shared-resources/shared-resources.module';
import { SharesModule } from 'omniboxd/shares/shares.module';

@Module({
  exports: [AttachmentsService],
  providers: [AttachmentsService],
  controllers: [AttachmentsController, ShareAttachmentsController],
  imports: [
    PermissionsModule,
    S3Module,
    ResourceAttachmentsModule,
    SharesModule,
    SharedResourcesModule,
    NamespacesQuotaModule,
  ],
})
export class AttachmentsModule {}
