import { Injectable } from '@nestjs/common';
import { BotBase } from 'omniboxd/applications/apps/bot-base';

@Injectable()
export class QQBot extends BotBase {
  public static readonly appId = 'qq_bot';
}
