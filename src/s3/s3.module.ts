import { Module } from '@nestjs/common';
import { S3Service } from 'omniboxd/s3/s3.service';

@Module({
  exports: [S3Service],
  providers: [S3Service],
  controllers: [],
  imports: [],
})
export class S3Module {}
