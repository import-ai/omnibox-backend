import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageUsage } from './entities/storage-usage.entity';
import { StorageUsagesService } from './storage-usages.service';

@Module({
  imports: [TypeOrmModule.forFeature([StorageUsage])],
  providers: [StorageUsagesService],
  exports: [StorageUsagesService],
})
export class StorageUsagesModule {}
