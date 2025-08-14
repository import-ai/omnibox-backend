import { Module } from '@nestjs/common';
import { SharesService } from './shares.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Share } from './entities/share.entity';
import {
  ResourceSharesController,
  SharesController,
} from './shares.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Share])],
  providers: [SharesService],
  exports: [SharesService],
  controllers: [ResourceSharesController, SharesController],
})
export class SharesModule {}
