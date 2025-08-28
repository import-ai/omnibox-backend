import { Expose } from 'class-transformer';
import { TraceEventDto } from './trace-event.dto';

export class TraceMessageDto {
  @Expose()
  timestamp: number;

  @Expose({ name: 'event_name' })
  eventName: string;

  @Expose({ name: 'user_id' })
  userId?: string;

  static fromEvent(event: TraceEventDto, userId?: string) {
    const message = new TraceMessageDto();
    message.timestamp = Date.now();
    message.eventName = event.name;
    message.userId = userId;
    return message;
  }
}
