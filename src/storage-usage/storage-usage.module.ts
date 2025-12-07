import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageUsageController } from './storage-usage.controller';
import { StorageUsageService } from './storage-usage.service';
import { S3Module } from 'omniboxd/s3/s3.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { File } from 'omniboxd/files/entities/file.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourceAttachment } from 'omniboxd/attachments/entities/resource-attachment.entity';

@Module({
  imports: [
    S3Module,
    NamespacesModule,
    NamespaceResourcesModule,
    PermissionsModule,
    TypeOrmModule.forFeature([File, Resource, ResourceAttachment]),
  ],
  controllers: [StorageUsageController],
  providers: [StorageUsageService],
  exports: [StorageUsageService],
})
export class StorageUsageModule {}
