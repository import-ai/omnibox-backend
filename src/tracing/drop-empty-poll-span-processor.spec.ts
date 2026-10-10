import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

import {
  DropEmptyPollSpanProcessor,
  EMPTY_POLL_TRACE_ATTR,
} from './drop-empty-poll-span-processor';

const POLL_PATH = '/internal/api/v1/wizard/tasks/poll';

function fakeSpan(overrides: Record<string, unknown> = {}): ReadableSpan {
  const attributes = {
    'http.target': POLL_PATH,
    ...(overrides.attributes as Record<string, unknown> | undefined),
  };
  return {
    spanContext: () => ({
      traceId: (overrides.traceId as string) ?? 'trace-1',
      spanId: (overrides.spanId as string) ?? 'span-1',
      traceFlags: 1,
    }),
    kind: (overrides.kind as SpanKind) ?? SpanKind.SERVER,
    attributes,
    status: {
      code: (overrides.status as SpanStatusCode) ?? SpanStatusCode.UNSET,
    },
    name: 'span',
    endTime: [0, 0],
    startTime: [0, 0],
    ended: true,
    duration: [0, 0],
    events: [],
    links: [],
    resource: { attributes: {} },
    instrumentationLibrary: { name: 'test' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as unknown as ReadableSpan;
}

describe('DropEmptyPollSpanProcessor', () => {
  function setup() {
    const exported: ReadableSpan[] = [];
    const delegate: SpanProcessor = {
      onStart: () => undefined,
      onEnd: (span) => exported.push(span),
      shutdown: () => Promise.resolve(),
      forceFlush: () => Promise.resolve(),
    };
    return { processor: new DropEmptyPollSpanProcessor(delegate), exported };
  }

  test('exports spans that are not a tasks/poll trace immediately', () => {
    const { processor, exported } = setup();
    const span = fakeSpan({
      attributes: { 'http.target': '/api/v1/health' },
    });

    processor.onEnd(span);

    expect(exported).toEqual([span]);
  });

  test('drops a poll trace when the HTTP span is an empty 200', () => {
    const { processor, exported } = setup();
    const child = fakeSpan({
      kind: SpanKind.INTERNAL,
      spanId: 'child',
      attributes: {},
    });
    const http = fakeSpan({
      spanId: 'http',
      attributes: {
        'http.target': POLL_PATH,
        'http.status_code': 200,
        [EMPTY_POLL_TRACE_ATTR]: true,
      },
    });

    processor.onStart(http as never, {} as never);
    processor.onEnd(child);
    processor.onEnd(http);

    expect(exported).toEqual([]);
  });

  test('exports a poll trace that returned a task', () => {
    const { processor, exported } = setup();
    const child = fakeSpan({
      kind: SpanKind.INTERNAL,
      spanId: 'child',
      attributes: {},
    });
    const http = fakeSpan({
      spanId: 'http',
      attributes: { 'http.target': POLL_PATH, 'http.status_code': 200 },
    });

    processor.onStart(http as never, {} as never);
    processor.onEnd(child);
    processor.onEnd(http);

    expect(exported).toEqual([child, http]);
  });

  test('exports a failed poll even if it was marked empty', () => {
    const { processor, exported } = setup();
    const http = fakeSpan({
      status: SpanStatusCode.ERROR,
      attributes: {
        'http.target': `${POLL_PATH}?x=1`,
        'http.status_code': 500,
        [EMPTY_POLL_TRACE_ATTR]: true,
      },
    });

    processor.onStart(http as never, {} as never);
    processor.onEnd(http);

    expect(exported).toEqual([http]);
  });
});
