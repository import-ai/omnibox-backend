import { Module } from '@nestjs/common';
import { InternalSharedResourceTagsController } from 'omniboxd/shared-resource-tags/internal.shared-resource-tags.controller';
import { SharedResourcesModule } from 'omniboxd/shared-resources/shared-resources.module';
import { SharedResourceTagsService } from 'omniboxd/shared-resource-tags/shared-resource-tags.service';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { TagModule } from 'omniboxd/tag/tag.module';

@Module({
  imports: [TagModule, SharedResourcesModule, SharesModule],
  controllers: [InternalSharedResourceTagsController],
  providers: [SharedResourceTagsService],
})
export class SharedResourceTagsModule {}
