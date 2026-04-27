import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  SmartFolderConfig,
  SmartFolderRootScope,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFolderEntitlementsResponseDto } from 'omniboxd/smart-folders/dto/smart-folder-entitlements-response.dto';
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
  ) {}

  async getEntitlements(
    namespaceId: string,
    userId: string,
  ): Promise<SmartFolderEntitlementsResponseDto> {
    const [privateUsed, teamUsed] = await Promise.all([
      this.countActive(namespaceId, userId, SmartFolderRootScope.PRIVATE),
      this.countActive(namespaceId, userId, SmartFolderRootScope.TEAMSPACE),
    ]);

    return SmartFolderEntitlementsResponseDto.fromValues({
      ...DEFAULT_ENTITLEMENTS,
      privateUsed,
      teamUsed,
    });
  }

  private async countActive(
    namespaceId: string,
    userId: string,
    rootScope: SmartFolderRootScope,
  ): Promise<number> {
    const queryBuilder = this.smartFolderConfigRepository
      .createQueryBuilder('config')
      .innerJoin('resources', 'resource', 'resource.id = config.resource_id')
      .where('config.namespace_id = :namespaceId', { namespaceId })
      .andWhere('config.root_scope = :rootScope', { rootScope })
      .andWhere('resource.deleted_at IS NULL');

    if (rootScope === SmartFolderRootScope.PRIVATE) {
      queryBuilder.andWhere('config.owner_user_id = :userId', { userId });
    }

    return await queryBuilder.getCount();
  }
}
