import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { SharesService } from './shares.service';
import { UpdateShareInfoReqDto } from './dto/update-share-info-req.dto';
import { ShareInfoDto } from './dto/share-info.dto';

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

  @Public()
  @Get()
  async getShareInfo(@Param('shareId') shareId: string) {
    const share = await this.sharesService.getShareById(shareId);
    if (!share || !share.enabled) {
      throw new NotFoundException(`Cannot find share with id ${shareId}.`);
    }
    return ShareInfoDto.fromEntity(share);
  }
}
