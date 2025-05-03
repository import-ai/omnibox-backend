import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'src/resources/resources.entity';
import { ResourcesService } from 'src/resources/resources.service';
import { ResourcesController } from 'src/resources/resources.controller';
import { Task } from 'src/tasks/tasks.entity';
import { MinioService } from 'src/resources/minio/minio.service';

@Module({
  exports: [ResourcesService, MinioService],
  providers: [ResourcesService, MinioService],
  controllers: [ResourcesController],
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Task]),
  ],
})
export class ResourcesModule {}
