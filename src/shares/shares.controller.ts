import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { SharesService } from './shares.service';
import { UpdateShareInfoReqDto } from './dto/update-share-info-req.dto';

@Controller('api/v1/namespaces/:namespaceId/resources/:resourceId/share')
export class SharesController {
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
