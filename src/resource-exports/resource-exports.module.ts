import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceExport } from './entities/resource-export.entity';
import { ResourceExportsService } from './resource-exports.service';
import { ResourceExportsController } from './resource-exports.controller';
import { S3Module } from 'omniboxd/s3/s3.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceExport]),
    S3Module,
    PermissionsModule,
    ResourcesModule,
  ],
  controllers: [ResourceExportsController],
  providers: [ResourceExportsService],
  exports: [ResourceExportsService],
})
export class ResourceExportsModule {}
