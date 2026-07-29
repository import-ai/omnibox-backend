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
import { CreateRssFolderRequestDto } from 'omniboxd/rss/dto/create-rss-folder-request.dto';
import { RssFolderLimitsResponseDto } from 'omniboxd/rss/dto/rss-folder-limits-response.dto';
import { RssFolderResponseDto } from 'omniboxd/rss/dto/rss-folder-response.dto';
import { RssItemDetailResponseDto } from 'omniboxd/rss/dto/rss-item-detail-response.dto';
import { RssItemResponseDto } from 'omniboxd/rss/dto/rss-item-response.dto';
import { RssLinkRequestDto } from 'omniboxd/rss/dto/rss-link-request.dto';
import { UpdateRssFolderRequestDto } from 'omniboxd/rss/dto/update-rss-folder-request.dto';
import { RssItem } from 'omniboxd/rss/entities/rss-item.entity';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssFeedValidatorService } from 'omniboxd/rss/rss-feed-validator.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { DataSource, In, Repository } from 'typeorm';

@Injectable()
export class RssFoldersService {
  constructor(
    @InjectRepository(RssLink)
    private readonly rssLinkRepository: Repository<RssLink>,
    @InjectRepository(RssItem)
    private readonly rssItemRepository: Repository<RssItem>,
    @InjectRepository(RssItemContent)
    private readonly rssItemContentRepository: Repository<RssItemContent>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly dataSource: DataSource,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly feedValidator: RssFeedValidatorService,
    private readonly permissionsService: PermissionsService,
    private readonly namespacesQuotaService: NamespacesQuotaService,
    private readonly i18n: I18nService,
  ) {}

  async getLimits(namespaceId: string): Promise<RssFolderLimitsResponseDto> {
    const [usage, namespaceTier] = await Promise.all([
      this.namespacesQuotaService.getNamespaceUsage(namespaceId),
      this.namespacesQuotaService.getNamespaceTier(namespaceId),
    ]);

    return RssFolderLimitsResponseDto.fromValues({
      tier: namespaceTier,
      linkLimit: usage.rssLinkLimit,
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
      const createdResource = await this.namespaceResourcesService.create(
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

  // Fetches an rss folder's items without any per-user permission check. Callers
  // must authorize access to the folder first: the authenticated path via
  // namespaceResourcesService.getResource, the shared path via a validated share
  // (SharedResourcesService.getAndValidateResource). Items are the (link,
  // content) relations produced by polling, joined to their stored content for
  // the article url/date/snippet.
  async listFolderItems(
    namespaceId: string,
    resourceId: string,
    limit?: number,
    offset?: number,
  ): Promise<RssItemResponseDto[]> {
    await this.getRssFolderOrFail(namespaceId, resourceId);

    const links = await this.rssLinkRepository.find({
      where: { namespaceId, resourceId },
      select: { id: true, name: true },
    });
    if (links.length === 0) {
      return [];
    }
    const linkIds = links.map((link) => link.id);
    const linkNameById = new Map(links.map((link) => [link.id, link.name]));

    const items = await this.rssItemRepository.find({
      where: { linkId: In(linkIds) },
      // Newest published first. Items store the fetch time when the feed omits
      // a date, so pub_date is normally set; NULLS LAST is defensive, and
      // createdAt/id break ties in insertion order.
      order: {
        pubDate: { direction: 'DESC', nulls: 'LAST' },
        createdAt: 'DESC',
        id: 'DESC',
      },
      ...(limit !== undefined && limit > 0 && { take: limit }),
      ...(offset !== undefined && offset > 0 && { skip: offset }),
    });
    if (items.length === 0) {
      return [];
    }

    const contentIds = [...new Set(items.map((item) => item.contentId))];
    const contents = await this.rssItemContentRepository.find({
      where: { id: In(contentIds) },
    });
    const contentById = new Map(contents.map((c) => [c.id, c]));

    return items.map((item) =>
      RssItemResponseDto.fromData(
        item,
        contentById.get(item.contentId),
        linkNameById.get(item.linkId) ?? null,
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
  // first (see listFolderItems).
  async getFolderItem(
    namespaceId: string,
    resourceId: string,
    itemId: string,
  ): Promise<RssItemDetailResponseDto> {
    await this.getRssFolderOrFail(namespaceId, resourceId);

    const links = await this.rssLinkRepository.find({
      where: { namespaceId, resourceId },
      select: { id: true, name: true },
    });
    const linkNameById = new Map(links.map((link) => [link.id, link.name]));
    const item = await this.rssItemRepository.findOne({
      where: {
        id: itemId,
        linkId: In(links.map((link) => link.id)),
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

    const content = await this.rssItemContentRepository.findOne({
      where: { id: item.contentId },
    });
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
      linkNameById.get(item.linkId) ?? null,
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

      if (dto.name !== undefined) {
        await this.namespaceResourcesService.update(
          namespaceId,
          userId,
          resourceId,
          { name: dto.name },
        );
      }

      if (validatedLinks !== undefined) {
        const existingLinks = await manager.find(RssLink, {
          where: { namespaceId, resourceId },
        });
        const existingByIndex = new Map(
          existingLinks.map((link) => [link.index, link]),
        );

        const removeLink = async (link: RssLink) => {
          // Soft-delete the link's items first: rss_items references rss_links
          // without ON DELETE CASCADE, and soft-deleting a still-related link
          // would otherwise leave the items pointing at a dead row.
          await manager.softDelete(RssItem, { linkId: link.id });
          await manager.softDelete(RssLink, link.id);
        };

        // Reconcile the links position by position (by index). A position whose
        // url is unchanged keeps its row id, and with it the rss_items polled
        // against it: a rename updates the row in place, an unchanged position is
        // left untouched. When the url at a position changes (or the position is
        // new), the old row (if any) is soft-deleted and a fresh one inserted.
        for (const [index, link] of validatedLinks.entries()) {
          const existing = existingByIndex.get(index);
          if (existing && existing.url === link.url) {
            if (existing.name !== link.name) {
              existing.name = link.name;
              await manager.save(existing);
            }
            continue;
          }
          if (existing) {
            await removeLink(existing);
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

        // Positions dropped from the end of the list are removed.
        for (const link of existingLinks) {
          if (link.index >= validatedLinks.length) {
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

  private normalizeLinks(links: RssLinkRequestDto[]): RssLinkRequestDto[] {
    return links.map((link) => ({
      url: link.url.trim(),
      name: link.name?.trim(),
    }));
  }

  private async assertLinkLimit(
    namespaceId: string,
    linkCount: number,
  ): Promise<void> {
    const limits = await this.getLimits(namespaceId);
    if (linkCount > limits.linkLimit) {
      const tier = this.i18n.t(`smartFolder.tiers.${limits.tier}`);
      const message = this.i18n.t('rssFolder.errors.linkLimitExceeded', {
        args: {
          received: linkCount,
          tier,
          limit: limits.linkLimit,
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
