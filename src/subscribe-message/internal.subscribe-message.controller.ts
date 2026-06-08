import { Body, Controller, Post } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

import { SendSubscribeMessageRequestDto } from './dto/send-subscribe-message-request.dto';
import {
  SendMessageResponseDto,
  SubscribeMessageService,
} from './subscribe-message.service';

@Controller('internal/api/v1')
export class InternalSubscribeMessageController {
  constructor(
    private readonly subscribeMessageService: SubscribeMessageService,
  ) {}

  @Public()
  @Post('subscribe-message/send')
  async send(
    @Body() dto: SendSubscribeMessageRequestDto,
  ): Promise<SendMessageResponseDto> {
    return await this.subscribeMessageService.sendMessage(dto);
  }
}
