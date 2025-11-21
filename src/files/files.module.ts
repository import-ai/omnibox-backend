import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from './entities/file.entity';
import { S3Module } from 'omniboxd/s3/s3.module';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([File]), S3Module],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
