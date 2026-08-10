import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { IRssFoldersQuotaService } from 'omniboxd/rss/rss-folders-quota.interface';
import { EntityManager, IsNull, Repository } from 'typeorm';

@Injectable()
export class RssFoldersQuotaService implements IRssFoldersQuotaService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
    @InjectRepository(NamespaceMember)
    private readonly namespaceMemberRepository: Repository<NamespaceMember>,
    private readonly resourcesService: ResourcesService,
    private readonly namespacesQuotaService: NamespacesQuotaService,
    private readonly i18n: I18nService,
  ) {}

  async assertCreateQuota(
    namespaceId: string,
    parentId: string,
    entityManager: EntityManager,
  ): Promise<void> {
    const rootId = await this.getRootIdForParent(namespaceId, parentId);
    const limit = await this.getFolderLimit(namespaceId, rootId);
    if (limit < 0) {
      return;
    }

    await this.lockQuotaDimension(entityManager, namespaceId, rootId);
    const count = await this.countActive(namespaceId, rootId);
    if (count >= limit) {
      const message = this.i18n.t('rssFolder.errors.quotaExceeded');
      throw new AppException(
        message,
        'RSS_FOLDER_QUOTA_EXCEEDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  async assertRestoreQuota(
    namespaceId: string,
    userId: string,
    resourceId: string,
  ): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      withDeleted: true,
      where: { namespaceId, id: resourceId },
    });
    if (
      !resource ||
      resource.resourceType !== ResourceType.RSS_FOLDER ||
      !resource.parentId
    ) {
      return;
    }

    const rootId = await this.getRestoreRootId(namespaceId, resource);
    if (!rootId) {
      return;
    }
    const limit = await this.getFolderLimit(namespaceId, rootId);
    if (limit < 0) {
      return;
    }

    const count = await this.countActive(namespaceId, rootId);
    if (count >= limit) {
      const message = this.i18n.t('rssFolder.errors.quotaExhausted');
      throw new AppException(
        message,
        'RSS_FOLDER_QUOTA_EXCEEDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  async countActive(namespaceId: string, rootId: string): Promise<number> {
    const resources = await this.resourcesService.getAllSubResources(
      namespaceId,
      [rootId],
    );
    return resources.filter(
      (resource) => resource.resourceType === ResourceType.RSS_FOLDER,
    ).length;
  }

  async getPrivateRootId(
    namespaceId: string,
    userId: string,
  ): Promise<string | null> {
    const member = await this.namespaceMemberRepository.findOne({
      where: { namespaceId, userId },
    });
    return member?.rootResourceId ?? null;
  }

  async getTeamspaceRootId(namespaceId: string): Promise<string | null> {
    const namespace = await this.namespaceRepository.findOne({
      where: { id: namespaceId },
    });
    return namespace?.rootResourceId ?? null;
  }

  private async getFolderLimit(
    namespaceId: string,
    rootId: string,
  ): Promise<number> {
    const [usage, teamspaceRootId] = await Promise.all([
      this.namespacesQuotaService.getNamespaceUsage(namespaceId),
      this.getTeamspaceRootId(namespaceId),
    ]);
    return rootId === teamspaceRootId
      ? usage.rssFolderTeamLimit
      : usage.rssFolderPrivateLimit;
  }

  private async getRootIdForParent(
    namespaceId: string,
    parentId: string,
  ): Promise<string> {
    const parentResources =
      await this.resourcesService.getParentResourcesOrFail(
        namespaceId,
        parentId,
      );
    return parentResources[parentResources.length - 1].id;
  }

  // Resolves the root the folder would land under when restored, mirroring the
  // reparenting in NamespaceResourcesService.restore: a live parent keeps the
  // folder in its current space, a deleted parent moves it to the creator's
  // private root.
  private async getRestoreRootId(
    namespaceId: string,
    resource: Resource,
  ): Promise<string | null> {
    const isParentDeleted = await this.resourcesService.isParentDeleted(
      namespaceId,
      resource.parentId,
    );
    if (!isParentDeleted) {
      return await this.getRootIdForParent(namespaceId, resource.parentId!);
    }
    if (!resource.userId) {
      return null;
    }
    const userRoot = await this.resourceRepository.findOne({
      where: {
        namespaceId,
        userId: resource.userId,
        parentId: IsNull(),
      },
    });
    return userRoot?.id ?? null;
  }

  private async lockQuotaDimension(
    entityManager: EntityManager,
    namespaceId: string,
    rootId: string,
  ): Promise<void> {
    await entityManager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`rss-folder-quota:${namespaceId}:${rootId}`],
    );
  }
}
