import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { TelemetryConfigService } from './telemetry.config';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private sdk: NodeSDK | null = null;
  private tracer: any;
  private readonly enabled: boolean;

  constructor(private configService: TelemetryConfigService) {
    this.enabled = this.configService.getConfig().enabled;
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log('OpenTelemetry tracing is disabled');
      return;
    }

    try {
      this.initializeTracing();
      this.logger.log('OpenTelemetry tracing initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize OpenTelemetry tracing', error);
    }
  }

  private initializeTracing() {
    const config = this.configService.getConfig();

    const url = `${config.otlpEndpoint}/v1/traces`;
    const otlpTraceExporter = new OTLPTraceExporter({ url });
    const spanProcessor = new BatchSpanProcessor(otlpTraceExporter);

    this.sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName,
        ['deployment.environment.name']: config.environment,
      }),
      spanProcessors: [spanProcessor],
      sampler: new TraceIdRatioBasedSampler(config.samplingRate),
      instrumentations: [
        new HttpInstrumentation({
          // Don't trace health check endpoints
          ignoreIncomingRequestHook: (req) => {
            return req.url?.includes('/api/v1/health') || false;
          },
        }),
        new ExpressInstrumentation(),
        new NestInstrumentation(),
      ],
    });

    this.sdk.start();
    this.tracer = trace.getTracer('omnibox-backend');
  }

  getTracer() {
    return this.tracer;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Helper method to create a span with common attributes
  createSpan(name: string, attributes?: Record<string, any>, kind?: SpanKind) {
    if (!this.enabled || !this.tracer) {
      return null;
    }

    return this.tracer.startSpan(name, {
      kind: kind || SpanKind.INTERNAL,
      attributes,
    });
  }

  // Helper method to wrap async operations with spans
  async withSpan<T>(
    name: string,
    operation: (span: any) => Promise<T>,
    attributes?: Record<string, any>,
    kind?: SpanKind,
  ): Promise<T> {
    if (!this.enabled || !this.tracer) {
      return operation(null);
    }

    const span = this.createSpan(name, attributes, kind);

    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        () => operation(span),
      );

      if (span) {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      return result;
    } catch (error) {
      if (span) {
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
      }
      throw error;
    } finally {
      if (span) {
        span.end();
      }
    }
  }

  // Add attributes to current span if it exists
  addAttributes(attributes: Record<string, any>) {
    if (!this.enabled) return;

    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.setAttributes(attributes);
    }
  }

  // Add event to current span if it exists
  addEvent(name: string, attributes?: Record<string, any>) {
    if (!this.enabled) return;

    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.addEvent(name, attributes);
    }
  }

  async onModuleDestroy() {
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
        this.logger.log('OpenTelemetry SDK shutdown completed');
      } catch (error) {
        this.logger.error('Error during OpenTelemetry SDK shutdown', error);
      }
    }
  }
}
