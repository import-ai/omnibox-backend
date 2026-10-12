import { MessageEvent } from '@nestjs/common';
import { MonoTypeOperatorFunction, Observable } from 'rxjs';

export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

export const SSE_HEARTBEAT_EVENT: Readonly<MessageEvent> = Object.freeze({
  type: 'ping',
  data: JSON.stringify({ response_type: 'ping' }),
});

/**
 * Emits a `ping` event whenever the source has been silent for `intervalMs`,
 * so proxies between the client and this server never see an idle SSE
 * connection during a long tool call.
 *
 * Nest's SseStream writes it as `event: ping` plus a `data:` line. The event
 * type lets clients filter it out (React Native's EventSource only dispatches
 * `message` events to the app; the web transport drops the data of non-default
 * events), and the JSON `data` payload keeps it visible in browser dev tools,
 * which discard events with an empty data buffer. Apply it at the `@Sse()`
 * controller layer only: the service observables are also consumed by the
 * non-streaming open API, which rejects unknown response types. Each ping is
 * a fresh copy of `SSE_HEARTBEAT_EVENT` because Nest's SseStream assigns an
 * `id` onto the message it writes. Because the ping is appended here rather
 * than through the session it never enters the replay buffer or the Redis
 * stream.
 */
export function withSseHeartbeat<T extends MessageEvent>(
  intervalMs = SSE_HEARTBEAT_INTERVAL_MS,
): MonoTypeOperatorFunction<T> {
  return (source) =>
    new Observable<T>((subscriber) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const clearTimer = () => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
      const scheduleTimer = () => {
        clearTimer();
        timer = setTimeout(() => {
          timer = undefined;
          subscriber.next({ ...SSE_HEARTBEAT_EVENT } as T);
          scheduleTimer();
        }, intervalMs);
      };

      scheduleTimer();
      const subscription = source.subscribe({
        next: (value) => {
          scheduleTimer();
          subscriber.next(value);
        },
        error: (error) => {
          clearTimer();
          subscriber.error(error);
        },
        complete: () => {
          clearTimer();
          subscriber.complete();
        },
      });

      return () => {
        clearTimer();
        subscription.unsubscribe();
      };
    });
}
