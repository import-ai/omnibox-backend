import { Module } from '@nestjs/common';
import { SharedResourcesController } from './shared-resources.controller';
import { SharedResourcesService } from './shared-resources.service';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { ResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';

@Module({
  controllers: [SharedResourcesController],
  providers: [SharedResourcesService],
  imports: [SharesModule, ResourcesModule],
  exports: [SharedResourcesService],
})
export class SharedResourcesModule {}
