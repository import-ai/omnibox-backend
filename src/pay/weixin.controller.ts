import { Request, Response } from 'express';
import { getClientIp } from 'request-ip';
import { WeixinService } from 'omniboxd/pay/weixin.service';
import {
  Req,
  Get,
  Post,
  Res,
  Param,
  Controller,
  HttpStatus,
} from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { I18nService } from 'nestjs-i18n';

@Controller('api/v1/pay/weixin')
export class WeixinController {
  constructor(
    private readonly weixinService: WeixinService,
    private readonly i18n: I18nService,
  ) {}

  @Post('transactions/:type/:productId')
  async transactions(
    @Req() req: Request,
    @UserId() userId: string,
    @Param('type') type: 'native' | 'jsapi' | 'h5',
    @Param('productId') productId: string,
  ) {
    const clientIP = getClientIp(req);
    if (!clientIP) {
      throw new AppException(
        this.i18n.t('pay.errors.cannotGetUserIP'),
        'CANNOT_GET_USER_IP',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.weixinService.transactions(
      userId,
      type,
      productId,
      clientIP,
    );
  }

  @Public()
  @Post('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    return await this.weixinService.callback(req, res);
  }

  @Get('query/:orderId')
  async query(@UserId() userId: string, @Param('orderId') orderId: string) {
    return await this.weixinService.query(userId, orderId);
  }
}
