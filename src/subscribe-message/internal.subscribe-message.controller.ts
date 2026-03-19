import { Controller, Post, Body } from '@nestjs/common';
import {
  SubscribeMessageService,
  SendMessageResponseDto,
} from './subscribe-message.service';
import { SendSubscribeMessageRequestDto } from './dto/send-subscribe-message-request.dto';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

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
