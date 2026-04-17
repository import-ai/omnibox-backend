import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TraceController } from 'omniboxd/trace/trace.controller';
import { TraceService } from 'omniboxd/trace/trace.service';
import { KafkaModule } from 'omniboxd/kafka/kafka.module';

@Module({
  imports: [ConfigModule, KafkaModule],
  controllers: [TraceController],
  providers: [TraceService],
  exports: [TraceService],
})
export class TraceModule {}
