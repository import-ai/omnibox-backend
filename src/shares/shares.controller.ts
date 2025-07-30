import { Controller, Get, Param, Patch, Req } from '@nestjs/common';

@Controller('api/v1/namespaces/:namespaceId/resources/:resourceId/share')
export class SharesController {
  constructor() {}

  @Get()
  async getShareInfo(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    // todo
  }

  @Patch()
  async updateShareInfo(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    // todo
  }
}
