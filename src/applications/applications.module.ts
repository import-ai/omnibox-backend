import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Applications } from './applications.entity';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { InternalApplicationsController } from './internal.applications.controller';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { WechatBot } from './apps/wechat-bot';

@Module({
  providers: [ApplicationsService, WechatBot],
  controllers: [ApplicationsController, InternalApplicationsController],
  exports: [ApplicationsService],
  imports: [
    TypeOrmModule.forFeature([Applications]),
    APIKeyModule,
    NamespacesModule,
  ],
})
export class ApplicationsModule {}
