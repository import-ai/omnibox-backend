import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from './entities/file.entity';
import { S3Module } from 'omniboxd/s3/s3.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';

@Module({
  imports: [TypeOrmModule.forFeature([File]), S3Module, NamespacesQuotaModule],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
