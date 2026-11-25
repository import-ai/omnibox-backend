import { context, propagation } from '@opentelemetry/api';

export function getActiveTraceHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);
  return headers;
}
