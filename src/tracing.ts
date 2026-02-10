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
import { ExpressLayerType } from '@opentelemetry/instrumentation-express/build/src/enums/ExpressLayerType';

const env = process.env.ENV || 'unknown';
const enableTypeormInstrumentation =
  process.env.ENABLE_TYPEORM_INSTRUMENTATION === 'true';

function isTracingEnabled(): boolean {
  if (process.env.JEST_WORKER_ID !== undefined) {
    return false;
  }

  return !isEmpty(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
}

let sdk: NodeSDK | null = null;

export interface TracingOptions {
  serviceName: string;
}

export default function getTracingSDK(options: TracingOptions): NodeSDK | null {
  if (sdk !== null) {
    return sdk;
  }
  if (!isTracingEnabled()) {
    return null;
  }

  const { serviceName } = options;
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT!;
  const url = `${otlpEndpoint}/v1/traces`;

  const otlpTraceExporter = new OTLPTraceExporter({ url });
  const spanProcessor = new BatchSpanProcessor(otlpTraceExporter);

  const excludedUrls = ['/api/v1/health'];

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      ['deployment.environment']: env,
    }),
    spanProcessors: [spanProcessor],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => {
          const pathname = new URL(req.url!, 'http://localhost').pathname;
          return excludedUrls.some((url) => pathname === url) || false;
        },
      }),
      new ExpressInstrumentation({
        ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
      }),
      new NestInstrumentation(),
      ...(enableTypeormInstrumentation ? [new TypeormInstrumentation()] : []),
    ],
  });

  return sdk;
}

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
