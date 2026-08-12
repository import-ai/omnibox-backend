import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssPoll } from 'omniboxd/rss/entities/rss-poll.entity';
import { RssFeedFetcherService } from 'omniboxd/rss/rss-feed-fetcher.service';
import { RssFeedValidatorService } from 'omniboxd/rss/rss-feed-validator.service';
import { RssFoldersController } from 'omniboxd/rss/rss-folders.controller';
import { RssFoldersService } from 'omniboxd/rss/rss-folders.service';
import { RSS_FOLDERS_QUOTA_SERVICE } from 'omniboxd/rss/rss-folders-quota.interface';
import { RssFoldersQuotaService } from 'omniboxd/rss/rss-folders-quota.service';
import { RssPollingCronService } from 'omniboxd/rss/rss-polling.cron.service';
import { RssPollingService } from 'omniboxd/rss/rss-polling.service';
import { SharedResourcesModule } from 'omniboxd/shared-resources/shared-resources.module';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { WizardAPIModule } from 'omniboxd/wizard-api/wizard-api.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RssLink,
      Resource,
      RssPoll,
      RssItemContent,
      Namespace,
      NamespaceMember,
    ]),
    NamespacesQuotaModule,
    PermissionsModule,
    NamespaceResourcesModule,
    ResourcesModule,
    WizardAPIModule,
    SharesModule,
    SharedResourcesModule,
  ],
  providers: [
    RssFoldersService,
    RssFoldersQuotaService,
    {
      provide: RSS_FOLDERS_QUOTA_SERVICE,
      useExisting: RssFoldersQuotaService,
    },
    RssFeedValidatorService,
    RssFeedFetcherService,
    RssPollingService,
    RssPollingCronService,
  ],
  controllers: [RssFoldersController],
  exports: [RSS_FOLDERS_QUOTA_SERVICE],
})
export class RssModule {}
