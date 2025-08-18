import { Global, Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
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

  async onModuleInit() {
    // Initialize telemetry when the module loads
    await this.telemetryService.onModuleInit();
  }

  async onModuleDestroy() {
    // Shutdown telemetry when the module is destroyed
    await this.telemetryService.onModuleDestroy();
  }
}