import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { TraceEventDto } from './dto/trace-event.dto';

@Injectable()
export class TraceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TraceService.name);
  private readonly topic?: string;
  private readonly kafka?: Kafka;
  private readonly producer?: Producer;

  constructor(private readonly configService: ConfigService) {
    const brokerUrl = this.configService.get<string>('OBB_KAFKA_BROKER');
    const topic = this.configService.get<string>('OBB_KAFKA_TOPIC');
    const clientId = this.configService.get<string>('OBB_KAFKA_CLIENT_ID');
    if (!brokerUrl || !topic || !clientId) {
      return;
    }
    const brokers = brokerUrl.split(',');
    this.topic = topic;
    this.kafka = new Kafka({
      clientId,
      brokers,
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    if (this.producer) {
      await this.producer.connect();
      this.logger.log('Kafka producer connected successfully');
    }
  }

  async onModuleDestroy() {
    if (this.producer) {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected');
    }
  }

  async emitTraceEvents(
    events: TraceEventDto[],
    userId?: string,
  ): Promise<void> {
    if (!this.producer || !this.topic) {
      return;
    }
    const messages = events.map((event) => ({
      value: JSON.stringify({
        event,
        userId,
        timestamp: new Date().toISOString(),
      }),
    }));
    await this.producer.send({
      topic: this.topic,
      messages,
    });
  }
}
