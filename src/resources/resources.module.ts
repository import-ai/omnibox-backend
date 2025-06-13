import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'src/resources/resources.entity';
import { ResourcesService } from 'src/resources/resources.service';
import { ResourcesController } from 'src/resources/resources.controller';
import { Task } from 'src/tasks/tasks.entity';
import { MinioService } from 'src/resources/minio/minio.service';
import { InternalResourcesController } from 'src/resources/internal.resource.controller';
import { PermissionsModule } from 'src/permissions/permissions.module';

@Module({
  exports: [ResourcesService, MinioService, InternalResourcesController],
  providers: [ResourcesService, MinioService, InternalResourcesController],
  controllers: [ResourcesController, InternalResourcesController],
  imports: [
    TypeOrmModule.forFeature([Resource]),
    TypeOrmModule.forFeature([Task]),
    PermissionsModule,
  ],
})
export class ResourcesModule {}
