import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { SmartFolderEntitlementsResponseDto } from 'omniboxd/smart-folders/dto/smart-folder-entitlements-response.dto';
import {
  SmartFolderConfig,
  SmartFolderOwnerScope,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { ISmartFolderEntitlementsProvider } from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { Repository } from 'typeorm';

const DEFAULT_ENTITLEMENTS = SmartFolderEntitlementsResponseDto.fromValues({
  tier: 'basic',
  privateLimit: 1,
  teamLimit: 1,
  privateUsed: 0,
  teamUsed: 0,
  ruleLimit: 3,
  trashRetentionDays: 7,
});

@Injectable()
export class SmartFolderEntitlementsService implements ISmartFolderEntitlementsProvider {
  constructor(
    @InjectRepository(SmartFolderConfig)
    private readonly smartFolderConfigRepository: Repository<SmartFolderConfig>,
    private readonly namespacesQuotaService: NamespacesQuotaService,
  ) {}

  async getEntitlements(
    namespaceId: string,
    userId: string,
  ): Promise<SmartFolderEntitlementsResponseDto> {
    const [privateUsed, teamUsed] = await Promise.all([
      this.countActive(namespaceId, userId, SmartFolderOwnerScope.PRIVATE),
      this.countActive(namespaceId, userId, SmartFolderOwnerScope.TEAMSPACE),
    ]);

    const usage =
      await this.namespacesQuotaService.getNamespaceUsage(namespaceId);

    const privateLimit =
      usage.smartFolderPrivateLimit ?? DEFAULT_ENTITLEMENTS.privateLimit;
    const teamLimit =
      usage.smartFolderTeamLimit ?? DEFAULT_ENTITLEMENTS.teamLimit;
    const ruleLimit =
      usage.smartFolderRuleLimit ?? DEFAULT_ENTITLEMENTS.ruleLimit;

    return SmartFolderEntitlementsResponseDto.fromValues({
      tier: ruleLimit > DEFAULT_ENTITLEMENTS.ruleLimit ? 'premium' : 'basic',
      privateLimit,
      teamLimit,
      trashRetentionDays: usage.trashRetentionDays,
      privateUsed,
      teamUsed,
      ruleLimit,
    });
  }

  private async countActive(
    namespaceId: string,
    userId: string,
    ownerScope: SmartFolderOwnerScope,
  ): Promise<number> {
    const queryBuilder = this.smartFolderConfigRepository
      .createQueryBuilder('config')
      .innerJoin('resources', 'resource', 'resource.id = config.resource_id')
      .where('config.namespace_id = :namespaceId', { namespaceId })
      .andWhere('config.owner_scope = :ownerScope', { ownerScope })
      .andWhere('resource.deleted_at IS NULL');

    if (ownerScope === SmartFolderOwnerScope.PRIVATE) {
      queryBuilder.andWhere('config.owner_user_id = :userId', { userId });
    }

    return await queryBuilder.getCount();
  }
}
