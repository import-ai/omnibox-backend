import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { CookieAuth } from 'omniboxd/auth/decorators';

import { NotificationAssetsService } from './notification-assets.service';

@Controller('api/v1/notification-assets')
export class NotificationAssetsController {
  constructor(
    private readonly notificationAssetsService: NotificationAssetsService,
  ) {}

  @Get(':assetName')
  @CookieAuth()
  async get(
    @Param('assetName') assetName: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.notificationAssetsService.pipeToResponse(assetName, response);
  }
}
