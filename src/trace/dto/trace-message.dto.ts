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

  @Expose()
  platform?: string;

  @Expose({ name: 'client_version' })
  clientVersion?: string;

  @Expose({ name: 'client_build' })
  clientBuild?: string;

  static fromEvent(
    event: TraceEventDto,
    context: {
      userId?: string;
      userAgent?: string;
      platform?: string;
      clientVersion?: string;
      clientBuild?: string;
    } = {},
  ) {
    const message = new TraceMessageDto();
    message.timestamp = Date.now();
    message.eventName = event.name;
    // Keep client metadata inside the JSON payload as well as in the
    // top-level fields. The current warehouse materialized view only maps
    // event_props, so dropping it here would make platform/version data
    // unavailable to queries.
    const props = { ...event.props };
    if (context.platform) props.platform = context.platform;
    if (context.clientVersion) props.client_version = context.clientVersion;
    if (context.clientBuild) props.client_build = context.clientBuild;
    message.eventProps = JSON.stringify(props);
    message.userId = context.userId;
    message.userAgent = context.userAgent;
    message.platform = context.platform;
    message.clientVersion = context.clientVersion;
    message.clientBuild = context.clientBuild;
    return message;
  }
}
