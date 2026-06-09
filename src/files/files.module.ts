import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { S3Module } from 'omniboxd/s3/s3.module';
import { StorageUsagesModule } from 'omniboxd/storage-usages/storage-usages.module';

import { File } from './entities/file.entity';
import { FilesService } from './files.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([File]),
    S3Module,
    NamespacesQuotaModule,
    StorageUsagesModule,
  ],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
