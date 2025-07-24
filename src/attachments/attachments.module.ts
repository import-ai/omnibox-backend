import { Module } from '@nestjs/common';
import { ResourcesModule } from 'omnibox-backend/resources/resources.module';
import { PermissionsModule } from 'omnibox-backend/permissions/permissions.module';
import { AttachmentsController } from 'omnibox-backend/attachments/attachments.controller';
import { AttachmentsService } from 'omnibox-backend/attachments/attachments.service';
import { AuthModule } from 'omnibox-backend/auth/auth.module';

@Module({
  exports: [AttachmentsService],
  providers: [AttachmentsService],
  controllers: [AttachmentsController],
  imports: [PermissionsModule, ResourcesModule, AuthModule],
})
export class AttachmentsModule {}
