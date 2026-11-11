import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import { BehaviorService } from './behavior.service';
import { type BehaviorContext, behaviorContext } from './behavior-context';
import { behaviorRequestKind } from './behavior-request';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function readBehaviorContext(
  request: Request,
  now = Date.now(),
): BehaviorContext | undefined {
  let type = behaviorRequestKind(
    request.method,
    request.originalUrl,
    request.body,
  );
  const declared = request.header('x-omnibox-action-type');
  if (
    type === 'annotation_comment' &&
    declared === 'document_comment' &&
    /\/comment-threads\/[^/]+\/comments$/.test(
      request.originalUrl.split('?')[0],
    )
  )
    type = 'document_comment';
  const id = request.header('x-omnibox-action-id');
  const raw = request.header('x-omnibox-action-started-at');
  const platform = request.header('x-client-platform');
  const userId = request.user?.id;
  const started = raw ? Date.parse(raw) : NaN;
  if (
    !type ||
    !id ||
    !UUID.test(id) ||
    !userId ||
    !platform ||
    !['web', 'ios', 'android'].includes(platform) ||
    !Number.isFinite(started) ||
    started > now + 60_000 ||
    started < now - 7 * 86_400_000
  )
    return;
  return {
    action_id: id,
    action_type: type,
    action_started_at: new Date(started).toISOString(),
    origin_platform: platform,
    user_id: userId,
    task_ids: [],
  };
}
@Injectable()
export class BehaviorInterceptor implements NestInterceptor {
  constructor(private readonly behavior: BehaviorService) {}
  intercept(execution: ExecutionContext, next: CallHandler) {
    const request = execution.switchToHttp().getRequest<Request>();
    const context = readBehaviorContext(request);
    if (!context || !this.behavior.enabled()) return next.handle();
    return new Observable((subscriber) => {
      let subscription: { unsubscribe(): void } | undefined;
      let disposed = false;
      void this.behavior
        .begin(context)
        .catch(() => false)
        .then((active) => {
          if (disposed) return;
          const attach = () => {
            subscription = next.handle().subscribe({
              next: (value) => {
                if (active) {
                  const id =
                    value && typeof value.id === 'string'
                      ? value.id
                      : undefined;
                  const upload = request.originalUrl
                    .split('?')[0]
                    .endsWith('/resources/files');
                  void (async () => {
                    await this.behavior.bind(
                      context,
                      upload ? undefined : id,
                      upload ? id : undefined,
                    );
                    if (
                      context.action_type !== 'ai_conversation' &&
                      !upload &&
                      context.task_ids.length === 0 &&
                      context.changed !== false
                    )
                      await this.behavior.result(context, 'success');
                  })().catch(() => undefined);
                }
                subscriber.next(value);
              },
              error: (error) => {
                if (active)
                  void this.behavior
                    .result(context, 'failed')
                    .catch(() => undefined);
                subscriber.error(error);
              },
              complete: () => subscriber.complete(),
            });
          };
          if (active) behaviorContext.run(context, attach);
          else attach();
        })
        .catch((error) => subscriber.error(error));
      return () => {
        disposed = true;
        subscription?.unsubscribe();
      };
    });
  }
}
