import { Body, Controller, Post, Req } from '@nestjs/common';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { clientBehaviorEvent } from 'omniboxd/behavior/behavior-events';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { TraceService } from 'omniboxd/trace/trace.service';

import type { TraceEventDto } from './dto/trace-event.dto';
import { TraceReqDto } from './dto/trace-req.dto';

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

@Controller('api/v1/trace')
export class TraceController {
  constructor(private traceService: TraceService) {}

  @Post()
  @CookieAuth({ onAuthFail: 'continue' })
  async trace(
    @Req() req: Request,
    @Body() traceReq: TraceReqDto,
    @UserId({ optional: true }) userId?: string,
  ): Promise<void> {
    const events = traceReq.events
      .map((event) => clientBehaviorEvent(event))
      .filter((event): event is TraceEventDto => !!event);
    await this.traceService.emitTraceEvents(events, {
      userId,
      userAgent: headerValue(req.headers['user-agent']),
      platform: headerValue(req.headers['x-client-platform']),
      clientVersion: headerValue(req.headers['x-client-version']),
      clientBuild: headerValue(req.headers['x-client-build']),
    });
  }
}
