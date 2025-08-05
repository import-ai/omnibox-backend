import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Share, ShareType } from './entities/share.entity';
import { Repository } from 'typeorm';
import { ShareInfoDto } from './dto/share-info.dto';
import { UpdateShareInfoReqDto } from './dto/update-share-info-req.dto';

@Injectable()
export class SharesService {
  constructor(
    @InjectRepository(Share)
    private readonly shareRepo: Repository<Share>,
  ) {}

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
        requireLogin: true,
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
      share.password = req.password;
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
