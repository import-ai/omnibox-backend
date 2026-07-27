import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssFeedValidatorService } from 'omniboxd/rss/rss-feed-validator.service';
import { RssFoldersController } from 'omniboxd/rss/rss-folders.controller';
import { RssFoldersService } from 'omniboxd/rss/rss-folders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RssLink, Resource]),
    NamespacesQuotaModule,
    PermissionsModule,
    ResourcesModule,
  ],
  providers: [RssFoldersService, RssFeedValidatorService],
  controllers: [RssFoldersController],
})
export class RssModule {}
