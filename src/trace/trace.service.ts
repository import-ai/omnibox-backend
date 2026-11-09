import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { instanceToPlain } from 'class-transformer';
import { KafkaService } from 'omniboxd/kafka/kafka.service';

import { TraceEventDto } from './dto/trace-event.dto';
import { TraceMessageDto } from './dto/trace-message.dto';

export interface TraceContext {
  userId?: string;
  userAgent?: string;
  platform?: string;
  clientVersion?: string;
  clientBuild?: string;
}

@Injectable()
export class TraceService {
  private readonly topic?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly kafkaService: KafkaService,
  ) {
    this.topic = this.configService.get<string>('OBB_TRACE_TOPIC');
  }

  async emitTraceEvents(
    events: TraceEventDto[],
    context: TraceContext = {},
  ): Promise<void> {
    if (!this.topic) {
      return;
    }
    const messages = events.map((event) => {
      const dto = TraceMessageDto.fromEvent(event, context);
      return {
        value: JSON.stringify(instanceToPlain(dto)),
      };
    });
    await this.kafkaService.produce(this.topic, messages);
  }
}
