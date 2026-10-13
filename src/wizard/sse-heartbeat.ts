import { MessageEvent } from '@nestjs/common';
import { MonoTypeOperatorFunction, Observable } from 'rxjs';

export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

// Nest's MessageEvent declares `data` as required, but its SseStream only
// writes a `data:` line when `data` is set, so a type-only event is valid.
export const SSE_HEARTBEAT_EVENT = Object.freeze({
  type: 'ping',
}) as Readonly<MessageEvent>;

/**
 * Emits a `ping` event whenever the source has been silent for `intervalMs`,
 * so proxies between the client and this server never see an idle SSE
 * connection during a long tool call.
 *
 * The ping carries only `type`. Nest's SseStream writes it as `event: ping`,
 * `id: N` and a blank line: a valid SSE event with no `data:` line. The web
 * transport and React Native's EventSource only act on `data:` lines and
 * `message` events, so they ignore it, and browsers (including the DevTools
 * EventStream panel) discard an event with an empty data buffer before
 * dispatching it, which is intended. Apply it at the `@Sse()` controller
 * layer only: the service observables also feed the non-streaming open API
 * and the websocket gateway. Each ping is a fresh copy of
 * `SSE_HEARTBEAT_EVENT` because SseStream assigns an `id` onto the message it
 * writes. Because the ping is appended here rather than through the session
 * it never enters the replay buffer or the Redis stream.
 */
export function withSseHeartbeat(
  intervalMs = SSE_HEARTBEAT_INTERVAL_MS,
): MonoTypeOperatorFunction<MessageEvent> {
  return (source) =>
    new Observable<MessageEvent>((subscriber) => {
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
          if (subscriber.closed) {
            return;
          }
          // Re-arm before emitting: a downstream that unsubscribes
          // synchronously inside next() (take, takeUntil) runs the teardown,
          // which must find this timer to clear it.
          scheduleTimer();
          subscriber.next({ ...SSE_HEARTBEAT_EVENT });
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
