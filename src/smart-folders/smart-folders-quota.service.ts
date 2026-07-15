import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  SmartFolderConfig,
  SmartFolderOwnerScope,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import {
  ISmartFolderEntitlementsProvider,
  SMART_FOLDER_ENTITLEMENTS_PROVIDER,
} from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { EntityManager, Repository } from 'typeorm';

@Injectable()
export class SmartFoldersQuotaService {
  constructor(
    @InjectRepository(SmartFolderConfig)
    private readonly smartFolderConfigRepository: Repository<SmartFolderConfig>,
    @Inject(SMART_FOLDER_ENTITLEMENTS_PROVIDER)
    private readonly entitlementsProvider: ISmartFolderEntitlementsProvider,
    private readonly i18n: I18nService,
  ) {}

  async assertEntitlements(
    namespaceId: string,
    userId: string,
    ownerScope: SmartFolderOwnerScope,
    ruleCount: number,
    entityManager?: EntityManager,
  ): Promise<void> {
    const entitlements = await this.assertRuleLimit(
      namespaceId,
      userId,
      ruleCount,
    );

    const limit =
      ownerScope === SmartFolderOwnerScope.PRIVATE
        ? entitlements.privateLimit
        : entitlements.teamLimit;
    if (limit < 0) {
      return;
    }

    if (entityManager) {
      await this.lockQuotaDimension(
        entityManager,
        namespaceId,
        userId,
        ownerScope,
      );
    }
    const count = await this.countActive(
      namespaceId,
      userId,
      ownerScope,
      entityManager,
    );
    if (count >= limit) {
      const message = this.i18n.t('resource.errors.smartFolderQuotaExceeded');
      throw new AppException(
        message,
        'SMART_FOLDER_QUOTA_EXCEEDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  async assertRuleLimit(
    namespaceId: string,
    userId: string,
    ruleCount: number,
  ) {
    const entitlements = await this.entitlementsProvider.getEntitlements(
      namespaceId,
      userId,
    );
    if (ruleCount > entitlements.ruleLimit) {
      throw new AppException(
        `Too many smart folder conditions: received ${ruleCount}. This workspace uses the ${entitlements.tier} tier, which allows at most ${entitlements.ruleLimit} conditions. Retry with ${entitlements.ruleLimit} or fewer conditions; if the folder already has ${entitlements.ruleLimit}, remove or replace one first.`,
        'SMART_FOLDER_RULE_LIMIT_EXCEEDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return entitlements;
  }

  async assertRestoreEntitlements(
    namespaceId: string,
    userId: string,
    ownerScope: SmartFolderOwnerScope,
  ): Promise<void> {
    const entitlements = await this.entitlementsProvider.getEntitlements(
      namespaceId,
      userId,
    );
    const limit =
      ownerScope === SmartFolderOwnerScope.PRIVATE
        ? entitlements.privateLimit
        : entitlements.teamLimit;
    if (limit < 0) {
      return;
    }

    const count = await this.countActive(namespaceId, userId, ownerScope);
    if (count >= limit) {
      const message = this.i18n.t('resource.errors.smartFolderQuotaExhausted');
      throw new AppException(
        message,
        'SMART_FOLDER_QUOTA_EXCEEDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  async countActive(
    namespaceId: string,
    userId: string,
    ownerScope: SmartFolderOwnerScope,
    entityManager?: EntityManager,
  ): Promise<number> {
    const repository =
      entityManager?.getRepository(SmartFolderConfig) ??
      this.smartFolderConfigRepository;
    const queryBuilder = repository
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

  private async lockQuotaDimension(
    entityManager: EntityManager,
    namespaceId: string,
    userId: string,
    ownerScope: SmartFolderOwnerScope,
  ): Promise<void> {
    const ownerKey =
      ownerScope === SmartFolderOwnerScope.PRIVATE ? userId : 'teamspace';
    await entityManager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`smart-folder-quota:${namespaceId}:${ownerKey}:${ownerScope}`],
    );
  }
}
