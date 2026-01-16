import { Controller, Post, Body } from '@nestjs/common';
import {
  SubscribeMessageService,
  SendMessageResponse,
} from './subscribe-message.service';
import { SendSubscribeMessageDto } from './dto/send-subscribe-message.dto';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

@Controller('api/v1/subscribe-message')
export class SubscribeMessageController {
  constructor(
    private readonly subscribeMessageService: SubscribeMessageService,
  ) {}

  @Public()
  @Post('send')
  async send(
    @Body() dto: SendSubscribeMessageDto,
  ): Promise<SendMessageResponse> {
    return await this.subscribeMessageService.sendMessage(dto);
  }
}
