import { Global, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelemetryService } from './telemetry.service';
import { TelemetryConfigService } from './telemetry.config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [TelemetryConfigService, TelemetryService],
  exports: [TelemetryService, TelemetryConfigService],
})
export class TelemetryModule implements OnModuleInit, OnModuleDestroy {
  constructor(private telemetryService: TelemetryService) {}

  onModuleInit() {
    this.telemetryService.onModuleInit();
  }

  async onModuleDestroy() {
    await this.telemetryService.onModuleDestroy();
  }
}
