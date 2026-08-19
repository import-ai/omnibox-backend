import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import {
  getDefaultSortOrder,
  ResourceSortBy,
} from 'omniboxd/resources/resource-sort';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { PublicShareInfoDto } from 'omniboxd/shared-resources/dto/public-share-info.dto';
import { SharedResourceMetaDto } from 'omniboxd/shared-resources/dto/shared-resource-meta.dto';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';
import { UserService } from 'omniboxd/user/user.service';
import { Repository } from 'typeorm';

import { ShareInfoDto } from './dto/share-info.dto';
import { UpdateShareInfoReqDto } from './dto/update-share-info-req.dto';
import { Share, ShareType } from './entities/share.entity';

@Injectable()
export class SharesService {
  constructor(
    @InjectRepository(Share)
    private readonly shareRepo: Repository<Share>,
    private readonly resourcesService: ResourcesService,
    private readonly smartFoldersService: SmartFoldersService,
    private readonly namespacesService: NamespacesService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
  ) {}

  private isFolderResource(resourceType: ResourceType): boolean {
    return [
      ResourceType.FOLDER,
      ResourceType.SMART_FOLDER,
      ResourceType.RSS_FOLDER,
    ].includes(resourceType);
  }

  async getShareById(shareId: string): Promise<Share | null> {
    return await this.shareRepo.findOne({
      where: {
        id: shareId,
      },
    });
  }

  /** Return an enabled, unexpired share without applying visitor access rules. */
  async getAvailableShareOrFail(shareId: string): Promise<Share> {
    const share = await this.getShareById(shareId);
    if (!share || !share.enabled || !share.userId) {
      const message = this.i18n.t('share.errors.shareNotFound', {
        args: { shareId },
      });
      throw new AppException(message, 'SHARE_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      const message = this.i18n.t('share.errors.shareNotFound', {
        args: { shareId },
      });
      throw new AppException(message, 'SHARE_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    return share;
  }

  async getAndValidateShare(
    shareId: string,
    password?: string,
    userId?: string,
  ) {
    const share = await this.getAvailableShareOrFail(shareId);

    if (share.requireLogin && !userId) {
      const message = this.i18n.t('share.errors.shareRequiresLogin');
      throw new AppException(
        message,
        'SHARE_REQUIRES_LOGIN',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (share.password) {
      if (!password) {
        const message = this.i18n.t('share.errors.invalidPassword', {
          args: { shareId },
        });
        throw new AppException(
          message,
          'INVALID_SHARE_PASSWORD',
          HttpStatus.FORBIDDEN,
        );
      }
      const match = await bcrypt.compare(password, share.password);
      if (!match) {
        const message = this.i18n.t('share.errors.invalidPassword', {
          args: { shareId },
        });
        throw new AppException(
          message,
          'INVALID_SHARE_PASSWORD',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    return share;
  }

  private getShareOwnerIdOrFail(share: Share): string {
    if (share.userId) {
      return share.userId;
    }

    const message = this.i18n.t('share.errors.shareNotFound', {
      args: { shareId: share.id },
    });
    throw new AppException(message, 'SHARE_NOT_FOUND', HttpStatus.NOT_FOUND);
  }

  async getPublicShareInfo(share: Share): Promise<PublicShareInfoDto> {
    const ownerUserId = this.getShareOwnerIdOrFail(share);
    const resource = await this.resourcesService.getResourceMeta(
      share.namespaceId,
      share.resourceId,
    );
    if (!resource) {
      const message = this.i18n.t('share.errors.shareNotFound', {
        args: { shareId: share.id },
      });
      throw new AppException(message, 'SHARE_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // A chat-only share still has to exist and resolve, but its visitor gets
    // no resource metadata: no name, no type, no timestamps, no attrs.
    if (share.shareType === ShareType.CHAT_ONLY) {
      const owner = await this.userService.find(ownerUserId);
      return PublicShareInfoDto.fromResourceMeta(
        share,
        undefined,
        owner.username,
      );
    }

    let hasChildren = false;
    if (resource.resourceType === ResourceType.SMART_FOLDER) {
      const children = await this.smartFoldersService.listChildren(
        ownerUserId,
        share.namespaceId,
        share.resourceId,
        { limit: 1 },
      );
      hasChildren = children.length > 0;
    } else {
      const children = await this.resourcesService.getChildren(
        share.namespaceId,
        [share.resourceId],
      );
      hasChildren = children.length > 0;
    }

    const resourceMeta = SharedResourceMetaDto.fromResourceMeta(
      share,
      resource,
      hasChildren,
    );
    const user = await this.userService.find(ownerUserId);
    return PublicShareInfoDto.fromResourceMeta(
      share,
      resourceMeta,
      user.username,
    );
  }

  async getShareInfo(
    namespaceId: string,
    resourceId: string,
  ): Promise<ShareInfoDto> {
    const share = await this.shareRepo.findOne({
      where: {
        namespaceId,
        resourceId,
      },
    });
    const manualSortAvailable = await this.isManualSortAvailable(
      namespaceId,
      resourceId,
    );
    const resource = await this.resourcesService.getResourceOrFail(
      namespaceId,
      resourceId,
    );
    if (!share) {
      const dto = ShareInfoDto.new(namespaceId, resourceId);
      dto.manualSortAvailable = manualSortAvailable;
      dto.allResources = this.isFolderResource(resource.resourceType);
      return dto;
    }
    const dto = ShareInfoDto.fromEntity(share, manualSortAvailable);
    if (this.isFolderResource(resource.resourceType)) {
      dto.allResources = true;
    }
    return dto;
  }

  private async isManualSortAvailable(
    namespaceId: string,
    resourceId: string,
  ): Promise<boolean> {
    const parents = await this.resourcesService.getParentResourcesOrFail(
      namespaceId,
      resourceId,
    );
    return parents.at(-1)?.manualSortInitializedAt != null;
  }

  async updateShareInfo(
    userId: string,
    namespaceId: string,
    resourceId: string,
    req: UpdateShareInfoReqDto,
  ): Promise<ShareInfoDto> {
    let share = await this.shareRepo.findOne({
      where: {
        namespaceId,
        resourceId,
      },
    });
    if (!share) {
      share = this.shareRepo.create({
        namespaceId,
        resourceId,
        enabled: false,
        allResources: false,
        requireLogin: false,
        shareType: ShareType.DOC_ONLY,
        password: null,
        expiresAt: null,
      });
    }
    const resource = await this.resourcesService.getResourceOrFail(
      namespaceId,
      resourceId,
    );
    const manualSortAvailable = await this.isManualSortAvailable(
      namespaceId,
      resourceId,
    );
    if (this.isFolderResource(resource.resourceType)) {
      share.allResources = true;
    }
    const allResources = req.allResources ?? share.allResources;
    if (
      (req.sortBy !== undefined || req.sortOrder !== undefined) &&
      !allResources
    ) {
      throw new AppException(
        this.i18n.t('share.errors.resourceSortRequiresAllResources'),
        'RESOURCE_SORT_REQUIRES_ALL_RESOURCES',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (req.sortBy === ResourceSortBy.MANUAL && !manualSortAvailable) {
      throw new AppException(
        this.i18n.t('share.errors.manualSortNotAvailable'),
        'MANUAL_SORT_NOT_AVAILABLE',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (share.enabled && !share.userId) {
      share.userId = userId;
    }
    if (req.enabled !== undefined) {
      share.enabled = req.enabled;
      share.userId = userId;
    }
    if (req.allResources !== undefined) {
      share.allResources = this.isFolderResource(resource.resourceType)
        ? true
        : req.allResources;
    }
    if (req.requireLogin !== undefined) {
      share.requireLogin = req.requireLogin;
    }
    if (req.password !== undefined) {
      if (req.password === null) {
        share.password = null;
      } else {
        const hash = await bcrypt.hash(req.password, 10);
        share.password = hash;
      }
    }
    if (req.shareType !== undefined) {
      share.shareType = req.shareType;
    }
    if (req.expiresAt !== undefined) {
      share.expiresAt = req.expiresAt;
    }
    if (req.expiresSeconds !== undefined) {
      share.expiresAt = new Date(Date.now() + req.expiresSeconds * 1000);
    }
    if (req.sortBy !== undefined) {
      share.sortBy = req.sortBy;
      if (req.sortOrder === undefined) {
        share.sortOrder = getDefaultSortOrder(req.sortBy);
      }
    }
    if (req.sortOrder !== undefined) {
      share.sortOrder = req.sortOrder;
    }
    const savedShare = await this.shareRepo.save(share);
    return ShareInfoDto.fromEntity(savedShare, manualSortAvailable);
  }
}
