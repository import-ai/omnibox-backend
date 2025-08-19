import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  BatchSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

// Environment configuration
const env = process.env.ENV || 'local';
const serviceName = `omnibox-backend-${env}`;

// Check if tracing is enabled
function isTracingEnabled(): boolean {
  // Disable telemetry in Jest test environment
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.JEST_WORKER_ID !== undefined
  ) {
    return false;
  }

  // For local environment, disabled by default
  if (env === 'local') {
    return process.env.OTEL_TRACES_ENABLED?.toLowerCase() === 'true';
  }

  // For other environments, enabled by default
  return process.env.OTEL_TRACES_ENABLED?.toLowerCase() !== 'false';
}

// Get sampling rate based on environment
function getSamplingRate(): number {
  const defaultRates: Record<string, number> = {
    local: 1.0,
    test: 1.0,
    dev: 0.1,
    publish: 0.01,
  };

  const envSamplingRate = process.env.OTEL_TRACES_SAMPLING_RATIO;
  if (envSamplingRate) {
    return parseFloat(envSamplingRate);
  }

  return defaultRates[env] || 1.0;
}

// Initialize OpenTelemetry SDK
let sdk: NodeSDK | null = null;

if (isTracingEnabled()) {
  const otlpEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  const url = `${otlpEndpoint}/v1/traces`;

  const otlpTraceExporter = new OTLPTraceExporter({ url });
  const spanProcessor = new BatchSpanProcessor(otlpTraceExporter);

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      ['deployment.environment.name']: env,
    }),
    spanProcessors: [spanProcessor],
    sampler: new TraceIdRatioBasedSampler(getSamplingRate()),
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
}

export default sdk;
