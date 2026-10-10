import { Context, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

export const EMPTY_POLL_TRACE_ATTR = 'omnibox.poll.empty';

const POLL_PATH = '/internal/api/v1/wizard/tasks/poll';

export function isPollServerSpan(span: {
  kind: SpanKind;
  attributes: ReadableSpan['attributes'];
}): boolean {
  if (span.kind !== SpanKind.SERVER) {
    return false;
  }
  const target = span.attributes['http.target'];
  if (typeof target === 'string' && target.split('?')[0] === POLL_PATH) {
    return true;
  }
  if (span.attributes['url.path'] === POLL_PATH) {
    return true;
  }
  const url = span.attributes['http.url'];
  if (typeof url !== 'string') {
    return false;
  }
  try {
    return new URL(url).pathname === POLL_PATH;
  } catch {
    return false;
  }
}

export function isEmptyPollSpan(span: ReadableSpan): boolean {
  if (span.attributes[EMPTY_POLL_TRACE_ATTR] !== true) {
    return false;
  }
  if (span.status.code === SpanStatusCode.ERROR) {
    return false;
  }
  const statusCode =
    span.attributes['http.status_code'] ??
    span.attributes['http.response.status_code'];
  return statusCode === undefined || statusCode === 200;
}

/**
 * Holds every span of a tasks/poll trace until the HTTP server span ends.
 * A 200 response with no task is not exported. Failures and claimed tasks are.
 */
export class DropEmptyPollSpanProcessor implements SpanProcessor {
  private readonly pollTraces = new Set<string>();
  private readonly pending = new Map<string, ReadableSpan[]>();

  constructor(private readonly delegate: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext);
    if (isPollServerSpan(span)) {
      this.pollTraces.add(span.spanContext().traceId);
    }
  }

  onEnd(span: ReadableSpan): void {
    const traceId = span.spanContext().traceId;
    if (!this.pollTraces.has(traceId)) {
      this.delegate.onEnd(span);
      return;
    }

    const buffered = this.pending.get(traceId) ?? [];
    buffered.push(span);
    this.pending.set(traceId, buffered);
    if (!isPollServerSpan(span)) {
      return;
    }

    this.pollTraces.delete(traceId);
    this.pending.delete(traceId);
    if (isEmptyPollSpan(span)) {
      return;
    }
    for (const item of buffered) {
      this.delegate.onEnd(item);
    }
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }
}
