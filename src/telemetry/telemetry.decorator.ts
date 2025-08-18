import { applyDecorators, SetMetadata } from '@nestjs/common';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

export const TRACE_METADATA_KEY = 'TRACE_METADATA';

export interface TraceOptions {
  name?: string;
  attributes?: Record<string, any>;
  kind?: SpanKind;
}

/**
 * Decorator to automatically create spans for method calls
 * Usage: @Trace() or @Trace({ name: 'custom-name', attributes: { key: 'value' } })
 */
export function Trace(options: TraceOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const spanName =
      options.name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = function (...args: any[]) {
      const tracer = trace.getTracer('omnibox-backend');

      // If tracing is not available, just execute the original method
      if (!tracer) {
        return originalMethod.apply(this, args);
      }

      const span = tracer.startSpan(spanName, {
        kind: options.kind || SpanKind.INTERNAL,
        attributes: options.attributes,
      });

      return context.with(trace.setSpan(context.active(), span), () => {
        try {
          const result = originalMethod.apply(this, args);

          // Handle both sync and async methods
          if (result && typeof result.then === 'function') {
            return result
              .then((res: any) => {
                span.setStatus({ code: SpanStatusCode.OK });
                return res;
              })
              .catch((error: any) => {
                span.recordException(error);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                throw error;
              })
              .finally(() => {
                span.end();
              });
          } else {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            return result;
          }
        } catch (error) {
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.end();
          throw error;
        }
      });
    };

    return descriptor;
  };
}

/**
 * Metadata decorator for storing trace information
 */
export const TraceMetadata = (options: TraceOptions) =>
  SetMetadata(TRACE_METADATA_KEY, options);

/**
 * Combined decorator that applies both trace functionality and metadata
 */
export const TraceMethod = (options: TraceOptions = {}) =>
  applyDecorators(Trace(options), TraceMetadata(options));
