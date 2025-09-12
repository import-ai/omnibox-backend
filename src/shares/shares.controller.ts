import { Body, Controller, Get, Param, Patch, Req, UseInterceptors } from '@nestjs/common';
import { SharesService } from './shares.service';
import { UpdateShareInfoReqDto } from './dto/update-share-info-req.dto';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { Cookies } from 'omniboxd/decorators/cookie.decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { ValidateShare, ValidatedShare } from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { Share } from 'omniboxd/shares/entities/share.entity';

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
@UseInterceptors(ValidateShareInterceptor)
export class PublicSharesController {
  constructor(private readonly sharesService: SharesService) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  @Get()
  async getShareInfo(
    @ValidatedShare() share: Share,
  ) {
    return await this.sharesService.getPublicShareInfo(share);
  }
}
