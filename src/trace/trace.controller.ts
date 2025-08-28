import { Body, Controller, Post } from '@nestjs/common';
import { TraceService } from 'omniboxd/trace/trace.service';
import { TraceReqDto } from './dto/trace-req.dto';

@Controller('api/v1/trace')
export class TraceController {
  constructor(private traceService: TraceService) {}

  @Post()
  async trace(@Body() traceReq: TraceReqDto): Promise<void> {
    await this.traceService.emitTraceEvents(traceReq.events);
  }
}
