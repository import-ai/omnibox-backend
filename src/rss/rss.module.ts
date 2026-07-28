import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { RssItem } from 'omniboxd/rss/entities/rss-item.entity';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssPoll } from 'omniboxd/rss/entities/rss-poll.entity';
import { RssFeedFetcherService } from 'omniboxd/rss/rss-feed-fetcher.service';
import { RssFeedValidatorService } from 'omniboxd/rss/rss-feed-validator.service';
import { RssFoldersController } from 'omniboxd/rss/rss-folders.controller';
import { RssFoldersService } from 'omniboxd/rss/rss-folders.service';
import { RssPollingCronService } from 'omniboxd/rss/rss-polling.cron.service';
import { RssPollingService } from 'omniboxd/rss/rss-polling.service';
import { WizardAPIModule } from 'omniboxd/wizard-api/wizard-api.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RssLink,
      Resource,
      RssPoll,
      RssItemContent,
      RssItem,
    ]),
    NamespacesQuotaModule,
    PermissionsModule,
    NamespaceResourcesModule,
    WizardAPIModule,
  ],
  providers: [
    RssFoldersService,
    RssFeedValidatorService,
    RssFeedFetcherService,
    RssPollingService,
    RssPollingCronService,
  ],
  controllers: [RssFoldersController],
})
export class RssModule {}
