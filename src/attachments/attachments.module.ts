import { Module } from '@nestjs/common';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { AttachmentsController } from 'omniboxd/attachments/attachments.controller';
import { ShareAttachmentsController } from 'omniboxd/attachments/share-attachments.controller';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { S3Module } from 'omniboxd/s3/s3.module';
import { ResourceAttachmentsModule } from 'omniboxd/resource-attachments/resource-attachments.module';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { SharedResourcesModule } from 'omniboxd/shared-resources/shared-resources.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';

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
