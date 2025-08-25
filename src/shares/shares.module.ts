import { Module } from '@nestjs/common';
import { SharesService } from './shares.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Share } from './entities/share.entity';
import {
  PublicSharesController,
  ResourceSharesController,
} from './shares.controller';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';

@Module({
  imports: [TypeOrmModule.forFeature([Share]), NamespaceResourcesModule],
  providers: [SharesService],
  exports: [SharesService],
  controllers: [ResourceSharesController, PublicSharesController],
})
export class SharesModule {}
