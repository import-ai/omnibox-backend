import { Module } from '@nestjs/common';
import { Tag } from 'src/tag/tag.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagService } from 'src/tag/tag.service';
import { TagController } from 'src/tag/tag.controller';

@Module({
  exports: [TagService],
  providers: [TagService],
  controllers: [TagController],
  imports: [TypeOrmModule.forFeature([Tag])],
})
export class TagModule {}
