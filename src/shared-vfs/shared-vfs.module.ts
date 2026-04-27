import { Module } from '@nestjs/common';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { SharedResourcesModule } from 'omniboxd/shared-resources/shared-resources.module';
import { InternalSharedVfsController } from './internal.shared-vfs.controller';
import { SharedVfsService } from './shared-vfs.service';

@Module({
  controllers: [InternalSharedVfsController],
  providers: [SharedVfsService],
  imports: [SharesModule, SharedResourcesModule],
})
export class SharedVfsModule {}
