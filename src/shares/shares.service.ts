import * as bcrypt from 'bcrypt';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Share, ShareType } from './entities/share.entity';
import { Repository } from 'typeorm';
import { ShareInfoDto } from './dto/share-info.dto';
import { UpdateShareInfoReqDto } from './dto/update-share-info-req.dto';
import { PublicShareInfoDto } from 'omniboxd/share-resources/dto/public-share-info.dto';
import { ResourcesService } from 'omniboxd/resources/resources.service';

@Injectable()
export class SharesService {
  constructor(
    @InjectRepository(Share)
    private readonly shareRepo: Repository<Share>,
    private readonly resourcesService: ResourcesService,
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
    if (!share || !share.enabled) {
      throw new NotFoundException(`No share found with id ${shareId}`);
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException(`No share found with id ${shareId}`);
    }

    if (share.requireLogin && !userId) {
      throw new UnauthorizedException('This share requires login');
    }

    if (share.password) {
      if (!password) {
        throw new ForbiddenException(`Invalid password for share ${shareId}`);
      }
      const match = await bcrypt.compare(password, share.password);
      if (!match) {
        throw new ForbiddenException(`Invalid password for share ${shareId}`);
      }
    }

    return share;
  }

  async getPublicShareInfo(
    shareId: string,
    password?: string,
    userId?: string,
  ): Promise<PublicShareInfoDto> {
    const share = await this.getAndValidateShare(shareId, password, userId);
    const resource = await this.resourcesService.get(share.resourceId);
    return PublicShareInfoDto.fromEntity(share, resource);
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
        shareType: ShareType.ALL,
        password: null,
        expiresAt: null,
      });
    }
    if (req.enabled !== undefined) {
      share.enabled = req.enabled;
    }
    if (req.all_resources !== undefined) {
      share.allResources = req.all_resources;
    }
    if (req.require_login !== undefined) {
      share.requireLogin = req.require_login;
    }
    if (req.password !== undefined) {
      if (req.password === null) {
        share.password = null;
      } else {
        const hash = await bcrypt.hash(req.password, 10);
        share.password = hash;
      }
    }
    if (req.share_type !== undefined) {
      share.shareType = req.share_type;
    }
    if (req.expires_at !== undefined) {
      share.expiresAt = req.expires_at;
    }
    if (req.expires_seconds !== undefined) {
      share.expiresAt = new Date(Date.now() + req.expires_seconds * 1000);
    }
    const savedShare = await this.shareRepo.save(share);
    return ShareInfoDto.fromEntity(savedShare);
  }
}
