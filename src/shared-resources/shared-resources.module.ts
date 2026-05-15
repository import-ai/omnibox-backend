import { Module } from '@nestjs/common';
import { SharedResourcesController } from './shared-resources.controller';
import { SharedResourcesService } from './shared-resources.service';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { SmartFoldersModule } from 'omniboxd/smart-folders/smart-folders.module';

@Module({
  controllers: [SharedResourcesController],
  providers: [SharedResourcesService],
  imports: [SharesModule, ResourcesModule, SmartFoldersModule, TagModule],
  exports: [SharedResourcesService],
})
export class SharedResourcesModule {}
