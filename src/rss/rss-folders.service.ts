import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { CreateRssFolderRequestDto } from 'omniboxd/rss/dto/create-rss-folder-request.dto';
import { RssFolderLimitsResponseDto } from 'omniboxd/rss/dto/rss-folder-limits-response.dto';
import { RssFolderResponseDto } from 'omniboxd/rss/dto/rss-folder-response.dto';
import { RssLinkRequestDto } from 'omniboxd/rss/dto/rss-link-request.dto';
import { UpdateRssFolderRequestDto } from 'omniboxd/rss/dto/update-rss-folder-request.dto';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssFeedValidatorService } from 'omniboxd/rss/rss-feed-validator.service';
import { RssFoldersQuotaService } from 'omniboxd/rss/rss-folders-quota.service';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
import { DataSource, EntityManager, Repository } from 'typeorm';

@Injectable()
export class RssFoldersService {
  constructor(
    @InjectRepository(RssLink)
    private readonly rssLinkRepository: Repository<RssLink>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly dataSource: DataSource,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly feedValidator: RssFeedValidatorService,
    private readonly permissionsService: PermissionsService,
    private readonly namespacesQuotaService: NamespacesQuotaService,
    private readonly quotaService: RssFoldersQuotaService,
    private readonly i18n: I18nService,
  ) {}

  async getLimits(
    namespaceId: string,
    userId: string,
  ): Promise<RssFolderLimitsResponseDto> {
    const [usage, namespaceTier, privateRootId, teamspaceRootId] =
      await Promise.all([
        this.namespacesQuotaService.getNamespaceUsage(namespaceId),
        this.namespacesQuotaService.getNamespaceTier(namespaceId),
        this.quotaService.getPrivateRootId(namespaceId, userId),
        this.quotaService.getTeamspaceRootId(namespaceId),
      ]);

    const [privateUsed, teamUsed] = await Promise.all([
      privateRootId
        ? this.quotaService.countActive(namespaceId, privateRootId)
        : 0,
      teamspaceRootId
        ? this.quotaService.countActive(namespaceId, teamspaceRootId)
        : 0,
    ]);

    return RssFolderLimitsResponseDto.fromValues({
      tier: namespaceTier,
      linkLimit: usage.rssLinkLimit,
      folderPrivateLimit: usage.rssFolderPrivateLimit,
      folderTeamLimit: usage.rssFolderTeamLimit,
      folderPrivateUsed: privateUsed,
      folderTeamUsed: teamUsed,
    });
  }

  async create(
    userId: string,
    namespaceId: string,
    dto: CreateRssFolderRequestDto,
  ): Promise<RssFolderResponseDto> {
    const links = this.normalizeLinks(dto.links);
    await this.assertLinkLimit(namespaceId, links.length);
    // Network I/O must stay outside the DB transaction below.
    const validatedLinks = await this.feedValidator.validateAll(links);

    const resource = await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      await this.quotaService.assertCreateQuota(
        namespaceId,
        dto.parentId,
        manager,
      );
      // createServiceOwned, not create: rss_folder is refused by the generic
      // entry point because the RssLink rows below are part of the folder.
      const createdResource =
        await this.namespaceResourcesService.createServiceOwned(
          userId,
          namespaceId,
          {
            name: dto.name,
            parentId: dto.parentId,
            resourceType: ResourceType.RSS_FOLDER,
            content: '',
            attrs: {},
          },
          tx,
        );

      await manager.save(
        RssLink,
        validatedLinks.map((link, index) =>
          manager.create(RssLink, {
            namespaceId,
            resourceId: createdResource.id,
            index,
            url: link.url,
            name: link.name,
          }),
        ),
      );

      return createdResource;
    });

    return await this.get(userId, namespaceId, resource.id);
  }

  async get(
    userId: string,
    namespaceId: string,
    resourceId: string,
  ): Promise<RssFolderResponseDto> {
    await this.getRssFolderOrFail(namespaceId, resourceId);
    const resource = await this.namespaceResourcesService.getResource({
      userId,
      namespaceId,
      resourceId,
    });
    const linkEntities = await this.rssLinkRepository.find({
      where: { namespaceId, resourceId },
      order: { index: 'ASC' },
    });
    return RssFolderResponseDto.fromData({ resource, links: linkEntities });
  }

  async update(
    userId: string,
    namespaceId: string,
    resourceId: string,
    dto: UpdateRssFolderRequestDto,
  ): Promise<RssFolderResponseDto> {
    await this.getRssFolderOrFail(namespaceId, resourceId);
    await this.assertCanEdit(namespaceId, resourceId, userId);

    let validatedLinks: { url: string; name: string }[] | undefined;
    if (dto.links !== undefined) {
      const links = this.normalizeLinks(dto.links);
      await this.assertLinkLimit(namespaceId, links.length);
      validatedLinks = await this.feedValidator.validateAll(links);
    }

    await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;

      if (dto.name !== undefined) {
        await this.namespaceResourcesService.update(
          namespaceId,
          userId,
          resourceId,
          { name: dto.name },
          false,
          tx,
        );
      }

      if (validatedLinks !== undefined) {
        const existingLinks = await manager.find(RssLink, {
          where: { namespaceId, resourceId },
        });
        const existingByUrl = new Map<string, RssLink>();
        for (const link of existingLinks) {
          // First row per url wins; any stale duplicate rows for the same url
          // are removed below (not reused).
          if (!existingByUrl.has(link.url)) {
            existingByUrl.set(link.url, link);
          }
        }

        const removeLink = async (link: RssLink) => {
          // The link's items go with it: they are its resources, and leaving
          // them behind would show a subscription's articles after the
          // subscription is gone. They stay soft-deleted (not purged) so a
          // later poll of the same url cannot resurrect them.
          await this.trashLinkItems(userId, namespaceId, link.id, tx);
          await manager.softDelete(RssLink, link.id);
        };

        // Reconcile by url identity, not position. An existing link whose url is
        // still present is reused at its new index (preserving the item
        // resources polled against it), updating its index/name in place; a rename or a
        // reorder is thus a cheap update, not a delete + re-poll. A new url is
        // inserted, and any existing row not reused (url removed, or a stale
        // duplicate) is soft-deleted afterwards.
        const reusedIds = new Set<string>();
        for (const [index, link] of validatedLinks.entries()) {
          const existing = existingByUrl.get(link.url);
          if (existing && !reusedIds.has(existing.id)) {
            reusedIds.add(existing.id);
            if (existing.index !== index || existing.name !== link.name) {
              existing.index = index;
              existing.name = link.name;
              await manager.save(existing);
            }
            continue;
          }
          await manager.save(
            manager.create(RssLink, {
              namespaceId,
              resourceId,
              index,
              url: link.url,
              name: link.name,
            }),
          );
        }

        for (const link of existingLinks) {
          if (!reusedIds.has(link.id)) {
            await removeLink(link);
          }
        }
      }
    });

    return await this.get(userId, namespaceId, resourceId);
  }

  async delete(
    userId: string,
    namespaceId: string,
    resourceId: string,
  ): Promise<void> {
    await this.getRssFolderOrFail(namespaceId, resourceId);
    await this.assertCanEdit(namespaceId, resourceId, userId);
    await this.namespaceResourcesService.delete(
      userId,
      namespaceId,
      resourceId,
    );
  }

  // Soft-deletes every item resource polled against a link, releasing their
  // storage usage and dropping them from the search index. Items are read-only
  // to users, so this goes through the internal delete path.
  private async trashLinkItems(
    userId: string,
    namespaceId: string,
    linkId: string,
    tx: Transaction,
  ): Promise<void> {
    const items = await this.findLinkItemIds(tx.entityManager, linkId);
    if (items.length === 0) {
      return;
    }
    await this.resourcesService.batchDeleteResources(
      userId,
      namespaceId,
      items,
      tx,
      { internal: true },
    );
  }

  private async findLinkItemIds(
    manager: EntityManager,
    linkId: string,
  ): Promise<string[]> {
    const rows = await manager
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .select('resource.id', 'id')
      .where('resource.resource_type = :resourceType', {
        resourceType: ResourceType.RSS_ITEM,
      })
      .andWhere("resource.attrs->>'link_id' = :linkId", { linkId })
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  private normalizeLinks(links: RssLinkRequestDto[]): RssLinkRequestDto[] {
    const seen = new Set<string>();
    const normalized: RssLinkRequestDto[] = [];
    for (const link of links) {
      const url = link.url.trim();
      // Collapse duplicate urls within a folder (first occurrence wins).
      // Otherwise the poller would relate the same content to two links and the
      // folder would list every item twice.
      if (seen.has(url)) {
        continue;
      }
      seen.add(url);
      normalized.push({ url, name: link.name?.trim() });
    }
    return normalized;
  }

  private async assertLinkLimit(
    namespaceId: string,
    linkCount: number,
  ): Promise<void> {
    const [usage, namespaceTier] = await Promise.all([
      this.namespacesQuotaService.getNamespaceUsage(namespaceId),
      this.namespacesQuotaService.getNamespaceTier(namespaceId),
    ]);
    if (linkCount > usage.rssLinkLimit) {
      const tier = this.i18n.t(`smartFolder.tiers.${namespaceTier}`);
      const message = this.i18n.t('rssFolder.errors.linkLimitExceeded', {
        args: {
          received: linkCount,
          tier,
          limit: usage.rssLinkLimit,
        },
      });
      throw new AppException(
        message,
        'RSS_FOLDER_LINK_LIMIT_EXCEEDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async getRssFolderOrFail(
    namespaceId: string,
    resourceId: string,
  ): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({
      where: {
        id: resourceId,
        namespaceId,
        resourceType: ResourceType.RSS_FOLDER,
      },
    });
    if (!resource) {
      const message = this.i18n.t('rssFolder.errors.notFound');
      throw new AppException(
        message,
        'RSS_FOLDER_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return resource;
  }

  private async assertCanEdit(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<void> {
    const allowed = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!allowed) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
  }
}
