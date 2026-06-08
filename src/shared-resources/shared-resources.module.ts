import { Module } from '@nestjs/common';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { SmartFoldersModule } from 'omniboxd/smart-folders/smart-folders.module';
import { TagModule } from 'omniboxd/tag/tag.module';

import { SharedResourcesController } from './shared-resources.controller';
import { SharedResourcesService } from './shared-resources.service';

@Module({
  controllers: [SharedResourcesController],
  providers: [SharedResourcesService],
  imports: [SharesModule, ResourcesModule, SmartFoldersModule, TagModule],
  exports: [SharedResourcesService],
})
export class SharedResourcesModule {}
