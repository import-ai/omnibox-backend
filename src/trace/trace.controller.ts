import { Body, Controller, Post, Req } from '@nestjs/common';
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
    @Req() req: Request,
    @Body() traceReq: TraceReqDto,
    @UserId({ optional: true }) userId?: string,
  ): Promise<void> {
    const userAgent = req.headers['user-agent'];
    await this.traceService.emitTraceEvents(traceReq.events, userId, userAgent);
  }
}
