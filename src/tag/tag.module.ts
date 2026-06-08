import { Module } from '@nestjs/common';
import { Tag } from 'omniboxd/tag/tag.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagService } from 'omniboxd/tag/tag.service';
import { OpenTagService } from 'omniboxd/tag/open.tag.service';
import { TagController } from 'omniboxd/tag/tag.controller';

@Module({
  exports: [TagService, OpenTagService],
  providers: [TagService, OpenTagService],
  controllers: [TagController],
  imports: [TypeOrmModule.forFeature([Tag])],
})
export class TagModule {}
