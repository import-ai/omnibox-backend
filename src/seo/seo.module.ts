import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeoController } from 'omniboxd/seo/seo.controller';
import { SeoService } from 'omniboxd/seo/seo.service';
import { UserOption } from 'omniboxd/user/entities/user-option.entity';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Share, Resource, UserOption])],
  controllers: [SeoController],
  providers: [SeoService],
  exports: [SeoService],
})
export class SeoModule {}
