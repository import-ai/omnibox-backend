import { Module } from '@nestjs/common';
import { MinioService } from 'omniboxd/minio/minio.service';

@Module({
  exports: [MinioService],
  providers: [MinioService],
  controllers: [],
  imports: [],
})
export class MinioModule {}
