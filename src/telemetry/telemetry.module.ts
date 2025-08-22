import { Module } from '@nestjs/common';
import { OpenTelemetryModule } from 'nestjs-otel';

@Module({
  imports: [
    OpenTelemetryModule.forRoot({
      // Configuration is handled in tracing.ts
    }),
  ],
  exports: [OpenTelemetryModule],
})
export class TelemetryModule {}
