import { Injectable } from '@nestjs/common';
import { BotBase } from 'omniboxd/applications/apps/bot-base';

@Injectable()
export class WechatBot extends BotBase {
  public static readonly appId = 'wechat_bot';
}
