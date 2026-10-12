import { MessageEvent } from '@nestjs/common';
import { MonoTypeOperatorFunction, Observable } from 'rxjs';

export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

// Nest's interface declares `data` as required, but its SseStream only writes
// a `data:` line when `data` is present, so a type-only event is valid here.
export const SSE_HEARTBEAT_EVENT = { type: 'ping' } as MessageEvent;

/**
 * Emits `{ type: 'ping' }` whenever the source has been silent for
 * `intervalMs`, so proxies between the client and this server never see an
 * idle SSE connection during a long tool call.
 *
 * The ping deliberately carries only `type`: Nest's SseStream writes it as
 * `event: ping\n\n`, a valid SSE event with no `data:` line, so the web and
 * mobile clients (which only act on `data:` lines) ignore it, and because it
 * is appended here rather than through the session it never enters the replay
 * buffer or the Redis stream.
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
          subscriber.next(SSE_HEARTBEAT_EVENT as T);
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
