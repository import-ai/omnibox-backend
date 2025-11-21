import * as bcrypt from 'bcrypt';
import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Share, ShareType } from './entities/share.entity';
import { Repository } from 'typeorm';
import { ShareInfoDto } from './dto/share-info.dto';
import { UpdateShareInfoReqDto } from './dto/update-share-info-req.dto';
import { PublicShareInfoDto } from 'omniboxd/shared-resources/dto/public-share-info.dto';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { SharedResourceMetaDto } from 'omniboxd/shared-resources/dto/shared-resource-meta.dto';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { UserService } from 'omniboxd/user/user.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class SharesService {
  constructor(
    @InjectRepository(Share)
    private readonly shareRepo: Repository<Share>,
    private readonly resourcesService: ResourcesService,
    private readonly namespacesService: NamespacesService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
  ) {}

  async getShareById(shareId: string): Promise<Share | null> {
    return await this.shareRepo.findOne({
      where: {
        id: shareId,
      },
    });
  }

  async getAndValidateShare(
    shareId: string,
    password?: string,
    userId?: string,
  ) {
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

  async getPublicShareInfo(share: Share): Promise<PublicShareInfoDto> {
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
    const subResources = await this.resourcesService.getSubResources(
      share.namespaceId,
      [share.resourceId],
    );
    const resourceMeta = SharedResourceMetaDto.fromResourceMeta(
      resource,
      subResources.length > 0,
    );
    const user = await this.userService.find(share.userId!);
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
    if (!share) {
      return ShareInfoDto.new(namespaceId, resourceId);
    }
    return ShareInfoDto.fromEntity(share);
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
    if (req.enabled !== undefined) {
      share.enabled = req.enabled;
      share.userId = userId;
    }
    if (req.allResources !== undefined) {
      share.allResources = req.allResources;
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
    const savedShare = await this.shareRepo.save(share);
    return ShareInfoDto.fromEntity(savedShare);
  }
}
