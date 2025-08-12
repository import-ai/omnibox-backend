import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { SharesService } from './shares.service';
import { UpdateShareInfoReqDto } from './dto/update-share-info-req.dto';
import { ShareInfoDto } from './dto/share-info.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CookieAuth } from 'omniboxd/auth';

@Controller('api/v1/namespaces/:namespaceId/resources/:resourceId/share')
export class ResourceSharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Get()
  async getShareInfo(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.sharesService.getShareInfo(namespaceId, resourceId);
  }

  @Patch()
  async updateShareInfo(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() updateReq: UpdateShareInfoReqDto,
  ) {
    return await this.sharesService.updateShareInfo(
      namespaceId,
      resourceId,
      updateReq,
    );
  }
}

@Controller('api/v1/shares/:shareId')
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @Get()
  async getShareInfo(
    @Param('shareId') shareId: string,
    @UserId({ optional: true }) userId?: string,
  ) {
    const share = await this.sharesService.getShareById(shareId);
    if (!share || !share.enabled) {
      throw new NotFoundException(`Cannot find share with id ${shareId}`);
    }

    // Check if share has expired
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException(`Cannot find share with id ${shareId}`);
    }

    // Check if share requires login and user is authenticated
    if (share.requireLogin && !userId) {
      throw new UnauthorizedException('This share requires authentication');
    }

    return ShareInfoDto.fromEntity(share);
  }
}
