import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenTagService } from 'omniboxd/tag/open.tag.service';
import { TagController } from 'omniboxd/tag/tag.controller';
import { Tag } from 'omniboxd/tag/tag.entity';
import { TagService } from 'omniboxd/tag/tag.service';

@Module({
  exports: [TagService, OpenTagService],
  providers: [TagService, OpenTagService],
  controllers: [TagController],
  imports: [TypeOrmModule.forFeature([Tag])],
})
export class TagModule {}
