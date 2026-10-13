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
 * Wire format: `event: ping`, `id: N`, `data: {"response_type":"ping"}`. The
 * `data:` line is required: react-native-sse 1.2.1 only resets the pending
 * event type after dispatching a block that carried data, so a data-less ping
 * would relabel the next `data:` block in the same chunk as `ping` and lose
 * it. The `event: ping` type lets clients filter it out (React Native's
 * EventSource only dispatches `message` events to the app; the web transport
 * drops the data of non-default events), and it stays visible in browser dev
 * tools. Apply it at the `@Sse()` controller layer only: the service
 * observables also feed the non-streaming open API and the websocket gateway.
 * Each ping is a fresh copy of `SSE_HEARTBEAT_EVENT` because SseStream
 * assigns an `id` onto the message it writes. Because the ping is appended
 * here rather than through the session it never enters the replay buffer or
 * the Redis stream.
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
