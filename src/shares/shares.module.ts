import { Module } from '@nestjs/common';
import { SharesService } from './shares.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Share } from './entities/share.entity';
import { SharesController } from './shares.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Share])],
  providers: [SharesService],
  exports: [SharesService],
  controllers: [SharesController],
})
export class SharesModule {}
