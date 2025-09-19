import { Module } from '@nestjs/common';
import { SharesService } from './shares.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Share } from './entities/share.entity';
import {
  PublicSharesController,
  ResourceSharesController,
} from './shares.controller';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Share]),
    ResourcesModule,
    NamespacesModule,
  ],
  providers: [SharesService],
  exports: [SharesService],
  controllers: [ResourceSharesController, PublicSharesController],
})
export class SharesModule {}
