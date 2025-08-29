import { Expose } from 'class-transformer';
import { TraceEventDto } from './trace-event.dto';

export class TraceMessageDto {
  @Expose()
  timestamp: number;

  @Expose({ name: 'event_name' })
  eventName: string;

  @Expose({ name: 'user_id' })
  userId?: string;

  @Expose({ name: 'user_agent' })
  userAgent?: string;

  @Expose()
  props: string;

  static fromEvent(event: TraceEventDto, userId?: string, userAgent?: string) {
    const message = new TraceMessageDto();
    message.timestamp = Date.now();
    message.eventName = event.name;
    message.userId = userId;
    message.userAgent = userAgent;
    message.props = JSON.stringify(event.props);
    return message;
  }
}
