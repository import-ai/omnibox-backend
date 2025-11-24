import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TraceEventDto } from './dto/trace-event.dto';
import { instanceToPlain } from 'class-transformer';
import { TraceMessageDto } from './dto/trace-message.dto';
import { KafkaService } from 'omniboxd/kafka/kafka.service';

@Injectable()
export class TraceService {
  private readonly topic?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly kafkaService: KafkaService,
  ) {
    this.topic = this.configService.get<string>('OBB_KAFKA_TOPIC');
  }

  async emitTraceEvents(
    events: TraceEventDto[],
    userId?: string,
    userAgent?: string,
  ): Promise<void> {
    if (!this.topic) {
      return;
    }
    const messages = events.map((event) => {
      const dto = TraceMessageDto.fromEvent(event, userId, userAgent);
      return {
        value: JSON.stringify(instanceToPlain(dto)),
      };
    });
    await this.kafkaService.produce(this.topic, messages);
  }
}
