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
        requireLogin: true,
        shareType: ShareType.ALL,
        password: null,
        expiresAt: null,
      });
    }
    if (req.enabled !== undefined) {
      share.enabled = req.enabled;
    }
    if (req.requireLogin !== undefined) {
      share.requireLogin = req.requireLogin;
    }
    if (req.password !== undefined) {
      share.password = req.password;
    }
    if (req.shareType !== undefined) {
      share.shareType = req.shareType;
    }
    if (req.expiresAt !== undefined) {
      share.expiresAt = req.expiresAt;
    }
    const savedShare = await this.shareRepo.save(share);
    return ShareInfoDto.fromEntity(savedShare);
  }
}
