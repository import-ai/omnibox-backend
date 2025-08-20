import { Module } from '@nestjs/common';
import {
  ShareResourcesController,
  SharesController,
} from './share-resources.controller';
import { ShareResourcesService } from './share-resources.service';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';

@Module({
  controllers: [ShareResourcesController, SharesController],
  providers: [ShareResourcesService],
  imports: [SharesModule, ResourcesModule],
  exports: [ShareResourcesService],
})
export class ShareResourcesModule {}
