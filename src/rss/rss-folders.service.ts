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
import { RssLinkRequestDto } from 'omniboxd/rss/dto/rss-link-request.dto';
import { UpdateRssFolderRequestDto } from 'omniboxd/rss/dto/update-rss-folder-request.dto';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssFeedValidatorService } from 'omniboxd/rss/rss-feed-validator.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class RssFoldersService {
  constructor(
    @InjectRepository(RssLink)
    private readonly rssLinkRepository: Repository<RssLink>,
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
        await manager.delete(RssLink, { namespaceId, resourceId });
        await manager.save(
          RssLink,
          validatedLinks.map((link, index) =>
            manager.create(RssLink, {
              namespaceId,
              resourceId,
              index,
              url: link.url,
              name: link.name,
            }),
          ),
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
