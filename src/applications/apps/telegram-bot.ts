import { Injectable } from '@nestjs/common';
import { BotBase } from 'omniboxd/applications/apps/bot-base';

@Injectable()
export class TelegramBot extends BotBase {
  public static readonly appId = 'telegram_bot';
}
