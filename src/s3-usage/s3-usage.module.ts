import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3UsageController } from './s3-usage.controller';
import { S3UsageService } from './s3-usage.service';
import { S3Module } from 'omniboxd/s3/s3.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { File } from 'omniboxd/files/entities/file.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourceAttachment } from 'omniboxd/attachments/entities/resource-attachment.entity';

@Module({
  imports: [
    S3Module,
    NamespacesModule,
    NamespaceResourcesModule,
    TypeOrmModule.forFeature([File, Resource, ResourceAttachment]),
  ],
  controllers: [S3UsageController],
  providers: [S3UsageService],
  exports: [S3UsageService],
})
export class S3UsageModule {}
