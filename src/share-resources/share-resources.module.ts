import { Module } from '@nestjs/common';
import { ShareResourcesController } from './share-resources.controller';
import { ShareResourcesService } from './share-resources.service';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';

@Module({
  controllers: [ShareResourcesController],
  providers: [ShareResourcesService],
  imports: [SharesModule, ResourcesModule],
  exports: [ShareResourcesService],
})
export class ShareResourcesModule {}
