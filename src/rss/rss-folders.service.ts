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
import {
  RssFolderInitialSyncStatus,
  RssFolderResponseDto,
} from 'omniboxd/rss/dto/rss-folder-response.dto';
import { RssItemDetailResponseDto } from 'omniboxd/rss/dto/rss-item-detail-response.dto';
import {
  RssItemContentRef,
  RssItemResponseDto,
} from 'omniboxd/rss/dto/rss-item-response.dto';
import { RssLinkRequestDto } from 'omniboxd/rss/dto/rss-link-request.dto';
import { UpdateRssFolderRequestDto } from 'omniboxd/rss/dto/update-rss-folder-request.dto';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssPoll } from 'omniboxd/rss/entities/rss-poll.entity';
import { RssFeedValidatorService } from 'omniboxd/rss/rss-feed-validator.service';
import { RssFoldersQuotaService } from 'omniboxd/rss/rss-folders-quota.service';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
import { DataSource, EntityManager, Repository } from 'typeorm';

@Injectable()
export class RssFoldersService {
  constructor(
    @InjectRepository(RssLink)
    private readonly rssLinkRepository: Repository<RssLink>,
    @InjectRepository(RssPoll)
    private readonly rssPollRepository: Repository<RssPoll>,
    @InjectRepository(RssItemContent)
    private readonly rssItemContentRepository: Repository<RssItemContent>,
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
    const [resource, linkEntities, initialSyncStatus] = await Promise.all([
      this.namespaceResourcesService.getResource({
        userId,
        namespaceId,
        resourceId,
      }),
      this.rssLinkRepository.find({
        where: { namespaceId, resourceId },
        order: { index: 'ASC' },
      }),
      this.getInitialSyncStatus(namespaceId, resourceId),
    ]);
    return RssFolderResponseDto.fromData({
      resource,
      links: linkEntities,
      initialSyncStatus,
    });
  }

  private async getInitialSyncStatus(
    namespaceId: string,
    resourceId: string,
  ): Promise<RssFolderInitialSyncStatus> {
    const rows: Array<{
      hasSucceeded: boolean;
      hasPolling: boolean;
      pollCount: number;
    }> = await this.rssPollRepository.query(
      `SELECT COALESCE(BOOL_OR(poll.status = 'succeed'), FALSE) AS "hasSucceeded",
              COALESCE(BOOL_OR(poll.status = 'polling'), FALSE) AS "hasPolling",
              COUNT(poll.id)::int AS "pollCount"
         FROM rss_links link
         LEFT JOIN rss_polls poll
           ON poll.url = link.url
          AND poll.created_at >= link.created_at
          AND poll.deleted_at IS NULL
        WHERE link.namespace_id = $1
          AND link.resource_id = $2
          AND link.deleted_at IS NULL
        GROUP BY link.id`,
      [namespaceId, resourceId],
    );

    if (rows.length === 0 || rows.every((row) => row.hasSucceeded)) {
      return RssFolderInitialSyncStatus.SUCCEEDED;
    }
    if (rows.some((row) => !row.hasSucceeded && row.hasPolling)) {
      return RssFolderInitialSyncStatus.POLLING;
    }
    if (rows.some((row) => !row.hasSucceeded && row.pollCount === 0)) {
      return RssFolderInitialSyncStatus.PENDING;
    }
    return RssFolderInitialSyncStatus.FAILED;
  }

  // Lists the polled items of an rss folder, newest first. Enforces read
  // permission on the folder resource, then delegates to the permission-free
  // fetch used by both the authenticated and shared read paths.
  async listItems(
    userId: string,
    namespaceId: string,
    resourceId: string,
    limit?: number,
    offset?: number,
  ): Promise<RssItemResponseDto[]> {
    // Enforces read permission on the folder resource (throws if no access).
    await this.namespaceResourcesService.getResource({
      userId,
      namespaceId,
      resourceId,
    });
    return await this.listFolderItems(namespaceId, resourceId, limit, offset);
  }

  // Fetches an rss folder's items without any per-user permission check.
  // Callers must authorize access to the folder first: the authenticated path
  // via namespaceResourcesService.getResource, the shared path via a validated
  // share (SharedResourcesService.getAndValidateResource). Items are now the
  // folder's `rss_item` resources, joined to the global (url, guid) fetch cache
  // for the feed snippet and the first-seen date.
  async listFolderItems(
    namespaceId: string,
    resourceId: string,
    limit?: number,
    offset?: number,
  ): Promise<RssItemResponseDto[]> {
    await this.getRssFolderOrFail(namespaceId, resourceId);

    // Paged in SQL: a folder can hold thousands of items, and this endpoint
    // must never materialize more than the requested window. Newest published
    // first — an item resource's created_at is its publish date — which is the
    // same order the generic listings give an rss folder's children.
    const query = this.resourceRepository
      .createQueryBuilder('resource')
      .where('resource.namespaceId = :namespaceId', { namespaceId })
      .andWhere('resource.parentId = :resourceId', { resourceId })
      .andWhere('resource.resourceType = :resourceType', {
        resourceType: ResourceType.RSS_ITEM,
      })
      .orderBy('resource.createdAt', 'DESC')
      .addOrderBy('resource.id', 'DESC');
    // Same window semantics as before: a missing or non-positive limit/offset
    // means "no limit" / "from the start".
    if (limit !== undefined && limit > 0) {
      query.limit(limit);
    }
    if (offset !== undefined && offset > 0) {
      query.offset(offset);
    }
    const items = await query.getMany();
    if (items.length === 0) {
      return [];
    }

    const [linkNameById, contentByKey] = await Promise.all([
      this.getLinkNames(namespaceId, resourceId),
      this.getItemContents(items),
    ]);
    return items.map((item) =>
      RssItemResponseDto.fromData(
        item,
        contentByKey.get(this.contentKey(item)),
        linkNameById.get(String(item.attrs?.link_id)) ?? null,
      ),
    );
  }

  // Reads a single item of an rss folder. Enforces read permission, then
  // delegates to the permission-free fetch.
  async getItem(
    userId: string,
    namespaceId: string,
    resourceId: string,
    itemId: string,
  ): Promise<RssItemDetailResponseDto> {
    await this.namespaceResourcesService.getResource({
      userId,
      namespaceId,
      resourceId,
    });
    return await this.getFolderItem(namespaceId, resourceId, itemId);
  }

  // Permission-free single-item fetch. Callers must authorize folder access
  // first (see listFolderItems). The item is looked up under its folder, so an
  // item of another folder is never reachable through this one.
  async getFolderItem(
    namespaceId: string,
    resourceId: string,
    itemId: string,
  ): Promise<RssItemDetailResponseDto> {
    await this.getRssFolderOrFail(namespaceId, resourceId);

    const item = await this.resourceRepository.findOne({
      where: {
        id: itemId,
        namespaceId,
        parentId: resourceId,
        resourceType: ResourceType.RSS_ITEM,
      },
    });
    if (!item) {
      const message = this.i18n.t('rssFolder.errors.itemNotFound');
      throw new AppException(
        message,
        'RSS_ITEM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    const [linkNameById, contentByKey] = await Promise.all([
      this.getLinkNames(namespaceId, resourceId),
      this.getItemContents([item]),
    ]);
    const content = contentByKey.get(this.contentKey(item));
    // No cache row, no item: it carries the parsed content and the first-seen
    // date, and this endpoint has answered 404 for a missing one since before
    // items were resources. Serving the item without it would report the
    // publish date as `created_at` and no `parsed_content` at all.
    if (!content) {
      const message = this.i18n.t('rssFolder.errors.itemNotFound');
      throw new AppException(
        message,
        'RSS_ITEM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return RssItemDetailResponseDto.fromData(
      item,
      content,
      linkNameById.get(String(item.attrs?.link_id)) ?? null,
    );
  }

  private async getLinkNames(
    namespaceId: string,
    resourceId: string,
  ): Promise<Map<string, string>> {
    const links = await this.rssLinkRepository.find({
      where: { namespaceId, resourceId },
      select: { id: true, name: true },
    });
    return new Map(links.map((link) => [link.id, link.name]));
  }

  // An item resource points at its cache row by the (feed url, guid) carried in
  // attrs — the same key rss_item_contents is unique on.
  private contentKey(item: Resource): string {
    return `${String(item.attrs?.url)}\n${String(item.attrs?.guid)}`;
  }

  // Loads the fetch/parse cache rows behind a page of items in one round trip,
  // matching whole (url, guid) pairs rather than the cross product of the two
  // columns.
  private async getItemContents(
    items: Resource[],
  ): Promise<Map<string, RssItemContentRef>> {
    const urls: string[] = [];
    const guids: string[] = [];
    for (const item of items) {
      const url = item.attrs?.url;
      const guid = item.attrs?.guid;
      if (typeof url === 'string' && typeof guid === 'string') {
        urls.push(url);
        guids.push(guid);
      }
    }
    if (urls.length === 0) {
      return new Map();
    }

    const rows: Array<{
      url: string;
      guid: string;
      content: string | null;
      parsedContent: string | null;
      createdAt: Date;
    }> = await this.rssItemContentRepository.query(
      `SELECT content.url,
              content.guid,
              content.content,
              content.parsed_content AS "parsedContent",
              content.created_at AS "createdAt"
         FROM rss_item_contents content
         JOIN unnest($1::text[], $2::text[]) AS key(url, guid)
           ON content.url = key.url AND content.guid = key.guid
        WHERE content.deleted_at IS NULL`,
      [urls, guids],
    );
    return new Map(
      rows.map((row) => [
        `${row.url}\n${row.guid}`,
        {
          content: row.content,
          parsedContent: row.parsedContent,
          createdAt: row.createdAt,
        },
      ]),
    );
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

      // Links first, name second, and never the other way round: this is the
      // lock order the poller cannot avoid, so it is the one every writer of a
      // feed folder has to follow. RssPollingService.insertItemResource takes
      // the link row FOR SHARE and only then inserts the item, and that insert
      // makes Postgres take FOR KEY SHARE on the folder resource through the
      // resources.parent_id self-FK — links before folder, with no place to put
      // an earlier folder lock that would not serialise every poll against
      // every folder edit. Renaming first here would take the folder row FOR
      // UPDATE (ResourcesService.updateResource locks pessimistic_write) before
      // waiting on the link row, i.e. folder before links, and two such
      // transactions deadlock: Postgres kills this one, so the user's config
      // save 500s and is lost. Both halves stay in this one transaction, so
      // name and links still commit or roll back together either way.
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
          // Take the link row before reading its items: a poll of the same url
          // may be about to insert one more copy, and it holds this row FOR
          // SHARE across its insert (see RssPollingService.subscriptionIsLive).
          // Locking here first means the poll either loses the row and skips
          // the item, or commits before this read and has its copy trashed
          // below — never inserts a live item under a link this transaction is
          // retiring.
          await manager.query(
            `SELECT 1 FROM rss_links WHERE id = $1 FOR UPDATE`,
            [link.id],
          );
          // The link's items go with it: they are its resources, and leaving
          // them behind would show a subscription's articles after the
          // subscription is gone. They are soft-deleted rather than purged, so
          // the history survives; re-subscribing to the same url does not bring
          // these rows back but polls fresh copies alongside them.
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

  // Soft-deletes every item resource polled against a link, dropping them from
  // the search index. Items never counted against the owner's storage quota, so
  // there is nothing to refund. Items are read-only to users, so this goes
  // through the internal delete path.
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
