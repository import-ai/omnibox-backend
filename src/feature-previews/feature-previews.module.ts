import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeaturePreview } from './entities/feature-preview.entity';
import { FeaturePreviewsController } from './feature-previews.controller';
import { FeaturePreviewsService } from './feature-previews.service';

@Module({
  providers: [FeaturePreviewsService],
  controllers: [FeaturePreviewsController],
  exports: [FeaturePreviewsService],
  imports: [TypeOrmModule.forFeature([FeaturePreview])],
})
export class FeaturePreviewsModule {}
