import { Module } from '@nestjs/common';
import { Tag } from 'omnibox-backend/tag/tag.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagService } from 'omnibox-backend/tag/tag.service';
import { TagController } from 'omnibox-backend/tag/tag.controller';

@Module({
  exports: [TagService],
  providers: [TagService],
  controllers: [TagController],
  imports: [TypeOrmModule.forFeature([Tag])],
})
export class TagModule {}
