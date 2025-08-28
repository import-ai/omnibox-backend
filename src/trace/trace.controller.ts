import { Body, Controller, Post } from '@nestjs/common';
import { TraceService } from 'omniboxd/trace/trace.service';
import { TraceEventDto } from 'omniboxd/trace/dto/trace-event.dto';

@Controller('api/v1')
export class TraceController {
  constructor(private traceService: TraceService) {}

  @Post('trace')
  async trace(@Body() event: TraceEventDto): Promise<void> {
    await this.traceService.emitTraceEvent(event.name, event.props);
  }
}
