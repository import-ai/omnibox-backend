import { Module } from '@nestjs/common';
import { Tag } from 'omniboxd/tag/tag.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagService } from 'omniboxd/tag/tag.service';
import { TagController } from 'omniboxd/tag/tag.controller';

@Module({
  exports: [TagService],
  providers: [TagService],
  controllers: [TagController],
  imports: [TypeOrmModule.forFeature([Tag])],
})
export class TagModule {}
