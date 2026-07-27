import { Injectable } from '@nestjs/common';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { RssFolderEntitlementsResponseDto } from 'omniboxd/rss/dto/rss-folder-entitlements-response.dto';
import { IRssFolderEntitlementsProvider } from 'omniboxd/rss/rss-folder-entitlements.interface';

const BASIC_SMART_FOLDER_RULE_LIMIT = 3;
const BASIC_LINK_LIMIT = 1;
const PREMIUM_LINK_LIMIT = 10;

@Injectable()
export class RssFolderEntitlementsService implements IRssFolderEntitlementsProvider {
  constructor(
    private readonly namespacesQuotaService: NamespacesQuotaService,
  ) {}

  async getEntitlements(
    namespaceId: string,
  ): Promise<RssFolderEntitlementsResponseDto> {
    const usage =
      await this.namespacesQuotaService.getNamespaceUsage(namespaceId);

    // Until the pro service ships a dedicated rss_link_limit field, derive
    // the tier the same way smart folders do: a raised rule limit == premium.
    const ruleLimit =
      usage.smartFolderRuleLimit ?? BASIC_SMART_FOLDER_RULE_LIMIT;
    const tier =
      ruleLimit > BASIC_SMART_FOLDER_RULE_LIMIT ? 'premium' : 'basic';
    const linkLimit =
      usage.rssLinkLimit ??
      (tier === 'premium' ? PREMIUM_LINK_LIMIT : BASIC_LINK_LIMIT);

    return RssFolderEntitlementsResponseDto.fromValues({
      tier,
      linkLimit,
    });
  }
}
