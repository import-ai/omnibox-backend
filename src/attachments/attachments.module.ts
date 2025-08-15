import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { AttachmentsController } from 'omniboxd/attachments/attachments.controller';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { MinioModule } from 'omniboxd/minio/minio.module';
import { ResourceAttachment } from './entities/resource-attachment.entity';

@Module({
  exports: [AttachmentsService],
  providers: [AttachmentsService],
  controllers: [AttachmentsController],
  imports: [
    TypeOrmModule.forFeature([ResourceAttachment]),
    PermissionsModule,
    MinioModule,
  ],
})
export class AttachmentsModule {}
