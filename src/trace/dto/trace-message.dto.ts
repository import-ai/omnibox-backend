import { Expose } from 'class-transformer';
import { TraceEventDto } from './trace-event.dto';

export class TraceMessageDto {
  @Expose()
  timestamp: string;

  @Expose({ name: 'event_name' })
  eventName: string;

  @Expose({ name: 'user_id' })
  userId?: string;

  static fromEvent(event: TraceEventDto, userId?: string) {
    const message = new TraceMessageDto();
    message.timestamp = new Date().toISOString();
    message.eventName = event.name;
    message.userId = userId;
    return message;
  }
}
