import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'src/resources/resources.entity';
import { ResourcesService } from 'src/resources/resources.service';
import { ResourcesController } from 'src/resources/resources.controller';

@Module({
  exports: [ResourcesService],
  providers: [ResourcesService],
  controllers: [ResourcesController],
  imports: [TypeOrmModule.forFeature([Resource])],
})
export class ResourcesModule {}
