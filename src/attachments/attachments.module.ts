import { Module } from '@nestjs/common';
import { PermissionsModule } from 'omnibox-backend/permissions/permissions.module';
import { AttachmentsController } from 'omnibox-backend/attachments/attachments.controller';
import { AttachmentsService } from 'omnibox-backend/attachments/attachments.service';
import { AuthModule } from 'omnibox-backend/auth/auth.module';
import { MinioModule } from 'omnibox-backend/minio/minio.module';

@Module({
  exports: [AttachmentsService],
  providers: [AttachmentsService],
  controllers: [AttachmentsController],
  imports: [PermissionsModule, MinioModule, AuthModule],
})
export class AttachmentsModule {}
