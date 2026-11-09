import { Body, Controller, Post, Req } from '@nestjs/common';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { TraceService } from 'omniboxd/trace/trace.service';

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
    await this.traceService.emitTraceEvents(traceReq.events, {
      userId,
      userAgent: headerValue(req.headers['user-agent']),
      platform: headerValue(req.headers['x-client-platform']),
      clientVersion: headerValue(req.headers['x-client-version']),
      clientBuild: headerValue(req.headers['x-client-build']),
    });
  }
}
