import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { SmartFoldersModule } from 'omniboxd/smart-folders/smart-folders.module';
import { UserModule } from 'omniboxd/user/user.module';

import { Share } from './entities/share.entity';
import {
  PublicSharesController,
  ResourceSharesController,
} from './shares.controller';
import { SharesService } from './shares.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Share]),
    ResourcesModule,
    NamespacesModule,
    SmartFoldersModule,
    UserModule,
  ],
  providers: [SharesService],
  exports: [SharesService],
  controllers: [ResourceSharesController, PublicSharesController],
})
export class SharesModule {}
