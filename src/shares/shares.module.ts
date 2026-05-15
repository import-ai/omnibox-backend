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
import { UserModule } from 'omniboxd/user/user.module';
import { SmartFoldersModule } from 'omniboxd/smart-folders/smart-folders.module';

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
