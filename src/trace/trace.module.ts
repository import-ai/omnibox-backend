import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TraceController } from 'omniboxd/trace/trace.controller';
import { TraceService } from 'omniboxd/trace/trace.service';

@Module({
  imports: [ConfigModule],
  controllers: [TraceController],
  providers: [TraceService],
  exports: [TraceService],
})
export class TraceModule {}
