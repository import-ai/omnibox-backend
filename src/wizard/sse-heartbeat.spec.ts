import { MessageEvent } from '@nestjs/common';
import {
  SSE_HEARTBEAT_EVENT,
  SSE_HEARTBEAT_INTERVAL_MS,
  withSseHeartbeat,
} from 'omniboxd/wizard/sse-heartbeat';
import { Subject } from 'rxjs';

const PING = SSE_HEARTBEAT_EVENT;

function collect(source: Subject<MessageEvent>, intervalMs?: number) {
  const events: MessageEvent[] = [];
  const terminal: string[] = [];
  const subscription = source.pipe(withSseHeartbeat(intervalMs)).subscribe({
    next: (event) => events.push(event),
    error: () => terminal.push('error'),
    complete: () => terminal.push('complete'),
  });
  return { events, terminal, subscription };
}

describe('withSseHeartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defaults to a 15 second ping event carrying a JSON payload', () => {
    expect(SSE_HEARTBEAT_INTERVAL_MS).toBe(15_000);
    expect(PING.type).toBe('ping');
    expect(JSON.parse(PING.data as string)).toEqual({ response_type: 'ping' });
    const source = new Subject<MessageEvent>();
    const { events } = collect(source);
    jest.advanceTimersByTime(14_999);
    expect(events).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(events).toEqual([PING]);
  });

  it('does not ping while the source emits more often than the interval', () => {
    const source = new Subject<MessageEvent>();
    const { events } = collect(source, 1_000);
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(600);
      source.next({ data: `event-${i}` });
    }
    expect(events).toEqual(
      Array.from({ length: 10 }, (_, i) => ({ data: `event-${i}` })),
    );
  });

  it('pings once after a silent interval and restarts after a source emission', () => {
    const source = new Subject<MessageEvent>();
    const { events } = collect(source, 1_000);
    jest.advanceTimersByTime(1_000);
    expect(events).toEqual([PING]);

    jest.advanceTimersByTime(700);
    source.next({ data: 'event' });
    jest.advanceTimersByTime(999);
    expect(events).toEqual([PING, { data: 'event' }]);
    jest.advanceTimersByTime(1);
    expect(events).toEqual([PING, { data: 'event' }, PING]);
  });

  it('keeps pinging across a long silent gap', () => {
    const source = new Subject<MessageEvent>();
    const { events } = collect(source);
    jest.advanceTimersByTime(46_000);
    expect(events).toEqual([PING, PING, PING]);
  });

  it('forwards complete and stops pinging afterwards', () => {
    const source = new Subject<MessageEvent>();
    const { events, terminal } = collect(source, 1_000);
    source.next({ data: 'done' });
    source.complete();
    expect(terminal).toEqual(['complete']);
    jest.advanceTimersByTime(10_000);
    expect(events).toEqual([{ data: 'done' }]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('forwards error and stops pinging afterwards', () => {
    const source = new Subject<MessageEvent>();
    const { events, terminal } = collect(source, 1_000);
    source.error(new Error('upstream failed'));
    expect(terminal).toEqual(['error']);
    jest.advanceTimersByTime(10_000);
    expect(events).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timer when the client unsubscribes', () => {
    const source = new Subject<MessageEvent>();
    const { events, subscription } = collect(source, 1_000);
    expect(jest.getTimerCount()).toBe(1);
    subscription.unsubscribe();
    expect(jest.getTimerCount()).toBe(0);
    expect(source.observed).toBe(false);
    jest.advanceTimersByTime(10_000);
    expect(events).toEqual([]);
  });
});
