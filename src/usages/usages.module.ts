import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageUsage } from './entities/storage-usage.entity';
import { UsagesService } from './usages.service';

@Module({
  imports: [TypeOrmModule.forFeature([StorageUsage])],
  providers: [UsagesService],
  exports: [UsagesService],
})
export class UsagesModule {}
