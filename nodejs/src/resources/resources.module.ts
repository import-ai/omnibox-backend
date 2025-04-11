import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesService } from './resources.service';
import { ResourcesController } from './resources.controller';
import { Resource } from './resources.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Resource])],
  providers: [ResourcesService],
  controllers: [ResourcesController],
})
export class ResourcesModule {}
