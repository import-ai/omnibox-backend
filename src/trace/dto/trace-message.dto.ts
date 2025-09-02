import { Expose } from 'class-transformer';
import { TraceEventDto } from './trace-event.dto';

export class TraceMessageDto {
  @Expose()
  timestamp: number;

  @Expose({ name: 'event_name' })
  eventName: string;

  @Expose({ name: 'event_props' })
  eventProps?: string;

  @Expose({ name: 'user_id' })
  userId?: string;

  @Expose({ name: 'user_agent' })
  userAgent?: string;

  static fromEvent(event: TraceEventDto, userId?: string, userAgent?: string) {
    const message = new TraceMessageDto();
    message.timestamp = Date.now();
    message.eventName = event.name;
    message.eventProps = JSON.stringify(event.props);
    message.userId = userId;
    message.userAgent = userAgent;
    return message;
  }
}
