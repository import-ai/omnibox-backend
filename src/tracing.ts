import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { TypeormInstrumentation } from '@opentelemetry/instrumentation-typeorm';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { Span } from '@opentelemetry/api';
import { ServerResponse } from 'http';

const env = process.env.ENV || 'unknown';
const serviceName = `omnibox-backend`;

function isTracingEnabled(): boolean {
  if (process.env.JEST_WORKER_ID !== undefined) {
    return false;
  }

  return !isEmpty(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
}

// Initialize OpenTelemetry SDK
let sdk: NodeSDK | null = null;

if (isTracingEnabled()) {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT!;
  const url = `${otlpEndpoint}/v1/traces`;

  const otlpTraceExporter = new OTLPTraceExporter({ url });
  const spanProcessor = new BatchSpanProcessor(otlpTraceExporter);

  const excludedUrls = ['/api/v1/health', '/internal/api/v1/wizard/task'];

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      ['deployment.environment']: env,
    }),
    spanProcessors: [spanProcessor],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => {
          return excludedUrls.some((url) => req.url?.includes(url)) || false;
        },
        responseHook: (span: Span, response: ServerResponse) => {
          const req = response.req as any;
          if (req.user?.id) {
            span.setAttribute('user.id', req.user.id);
          }
        },
      }),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new TypeormInstrumentation(),
    ],
  });
}

export default sdk;

process.on('SIGTERM', () => {
  if (!sdk) {
    return;
  }
  sdk
    .shutdown()
    .then(
      () => console.log('SDK shut down successfully'),
      (err) => console.log('Error shutting down SDK', err),
    )
    .finally(() => process.exit(0));
});
