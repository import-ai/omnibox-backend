import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { I18nService } from 'nestjs-i18n';
import { supportsClientFeature } from 'omniboxd/utils/client-features';
import { map } from 'rxjs/operators';

/** Adapt response copies only: storage, model context and replay buffers retain images. */
export function withoutConversationImages(
  payload: any,
  placeholder: string,
): any {
  if (!payload || typeof payload !== 'object') return payload;

  // Nest SSE messages carry serialized chat events, including resumed events.
  if (typeof payload.data === 'string') {
    let event: any;
    try {
      event = JSON.parse(payload.data);
    } catch {
      return payload;
    }
    const compatible = withoutConversationImages(event, placeholder);
    return compatible === event
      ? payload
      : { ...payload, data: JSON.stringify(compatible) };
  }
  if (payload.mapping && typeof payload.mapping === 'object') {
    return {
      ...payload,
      mapping: Object.fromEntries(
        Object.entries(payload.mapping).map(([id, message]) => [
          id,
          withoutConversationImages(message, placeholder),
        ]),
      ),
    };
  }
  const parts = payload.attrs?.composer?.display_parts;
  if (!Array.isArray(parts) || !parts.some((part) => part?.type === 'image'))
    return payload;
  return {
    ...payload,
    attrs: {
      ...payload.attrs,
      composer: {
        ...payload.attrs.composer,
        display_parts: parts.filter((part) => part?.type !== 'image'),
      },
    },
    ...(payload.message && !payload.message.content?.trim()
      ? {
          message: { ...payload.message, content: placeholder },
        }
      : {}),
  };
}

@Injectable()
export class ChatClientCompatibilityInterceptor implements NestInterceptor {
  constructor(private readonly i18n: I18nService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    // Nest commits SSE headers before subscribing; those streams are already no-cache.
    if (!response.headersSent) {
      response.vary('X-Client-Platform, X-Client-Version');
    }
    if (supportsClientFeature(request.headers, 'conversationImages')) {
      return next.handle();
    }
    const placeholder = this.i18n.t('conversation.imageUpgradeRequired');
    return next
      .handle()
      .pipe(
        map((response) => withoutConversationImages(response, placeholder)),
      );
  }
}
