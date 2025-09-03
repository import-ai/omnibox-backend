import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from './entities/resource.entity';
import { ResourcesService } from './resources.service';
import { TasksModule } from 'omniboxd/tasks/tasks.module';

@Module({
  imports: [TypeOrmModule.forFeature([Resource]), TasksModule],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
