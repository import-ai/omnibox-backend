import { Module } from '@nestjs/common';
import { SharedResourcesController } from './shared-resources.controller';
import { SharedResourcesService } from './shared-resources.service';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';

@Module({
  controllers: [SharedResourcesController],
  providers: [SharedResourcesService],
  imports: [SharesModule, NamespaceResourcesModule, ResourcesModule],
  exports: [SharedResourcesService],
})
export class SharedResourcesModule {}
