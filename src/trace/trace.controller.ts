import { Body, Controller, Post } from '@nestjs/common';
import { TraceService } from 'omniboxd/trace/trace.service';
import { TraceReqDto } from './dto/trace-req.dto';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/trace')
export class TraceController {
  constructor(private traceService: TraceService) {}

  @Post()
  @CookieAuth({ onAuthFail: 'continue' })
  async trace(
    @Body() traceReq: TraceReqDto,
    @UserId({ optional: true }) userId?: string,
  ): Promise<void> {
    await this.traceService.emitTraceEvents(traceReq.events, userId);
  }
}
