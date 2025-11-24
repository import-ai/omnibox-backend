import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, ProducerRecord, Message } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka?: Kafka;
  private producer?: Producer;

  constructor(private readonly configService: ConfigService) {
    const brokers = this.configService.get<string>('OBB_KAFKA_BROKERS');

    if (!brokers) {
      return;
    }

    const clientId = this.configService.get<string>(
      'OBB_KAFKA_CLIENT_ID',
      'omnibox-backend',
    );

    this.kafka = new Kafka({
      clientId,
      brokers: brokers.split(','),
    });

    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    if (this.producer) {
      await this.producer.connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
  }

  async produce(topic: string, messages: Message[]): Promise<void> {
    if (!this.producer) {
      this.logger.warn('Kafka is not configured, skipping message production');
      return;
    }

    const record: ProducerRecord = {
      topic,
      messages,
    };

    await this.producer.send(record);
  }
}
