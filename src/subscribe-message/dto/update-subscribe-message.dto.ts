import { PartialType } from '@nestjs/swagger';
import { CreateSubscribeMessageDto } from './create-subscribe-message.dto';

export class UpdateSubscribeMessageDto extends PartialType(
  CreateSubscribeMessageDto,
) {}
