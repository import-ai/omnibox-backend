import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  environment: string;
  otlpEndpoint: string;
  samplingRate: number;
}

@Injectable()
export class TelemetryConfigService {
  private readonly config: TelemetryConfig;

  constructor(private configService: ConfigService) {
    const env = this.configService.get<string>('ENV', 'local');
    this.config = {
      enabled: this.getEnabledForEnv(env),
      serviceName: `omnibox-backend-${env}`,
      environment: env,
      otlpEndpoint: this.configService.get<string>(
        'OTEL_EXPORTER_OTLP_ENDPOINT',
        'http://localhost:4318',
      ),
      samplingRate: this.getSamplingRateForEnv(env),
    };
  }

  getConfig(): TelemetryConfig {
    return this.config;
  }

  private getEnabledForEnv(env: string): boolean {
    // Disable telemetry in Jest test environment
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
      return false;
    }
    
    // For local environment, disabled by default
    if (env === 'local') {
      return this.configService.get<string>('OTEL_TRACES_ENABLED', 'false').toLowerCase() === 'true';
    }
    // For other environments, enabled by default
    return this.configService.get<string>('OTEL_TRACES_ENABLED', 'true').toLowerCase() === 'true';
  }

  private getSamplingRateForEnv(env: string): number {
    const defaultRates: Record<string, number> = {
      local: 1.0,
      test: 1.0,
      dev: 0.1,
      publish: 0.01,
    };

    const envSamplingRate = this.configService.get<string>('OTEL_TRACES_SAMPLING_RATIO');
    if (envSamplingRate) {
      return parseFloat(envSamplingRate);
    }

    return defaultRates[env] || 1.0;
  }
}