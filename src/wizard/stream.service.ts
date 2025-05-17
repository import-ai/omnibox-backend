import { MessagesService } from 'src/messages/messages.service';
import { User } from 'src/user/user.entity';
import { Observable, Subscriber } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { Message } from 'src/messages/entities/message.entity';
import { AgentRequestDto } from 'src/wizard/dto/agent-request.dto';

export class StreamService {
  constructor(
    private readonly wizardBaseUrl: string,
    private readonly messagesService: MessagesService,
  ) {}

  async stream(
    url: string,
    body: Record<string, any>,
    callback: (data: string) => Promise<void>,
  ): Promise<void> {
    const response = await fetch(`${this.wizardBaseUrl}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch from wizard');
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }
    const decoder = new TextDecoder();
    let buffer: string = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const lineEnd = buffer.indexOf('\n');
          if (lineEnd == -1) break;

          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            await callback(data);
          }
        }
      }
    } finally {
      await reader.cancel();
    }
  }

  agentHandler(
    conversationId: string,
    user: User,
    subscriber: Subscriber<MessageEvent>,
  ): (data: string, parentId?: string) => Promise<string | undefined> {
    return async (
      data: string,
      parentId?: string,
    ): Promise<string | undefined> => {
      const chunk = JSON.parse(data) as {
        response_type: string;
        message: Record<string, any>;
      };

      if (chunk.response_type === 'openai_message') {
        const message: Message = await this.messagesService.create(
          conversationId,
          user,
          { message: chunk.message, parentId },
        );
        return message.id;
      }
      subscriber.next({ data });
      return undefined;
    };
  }

  chatStream(body: Record<string, any>): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      this.stream('/api/v1/grimoire/stream', body, (data) => {
        subscriber.next({ data });
        return Promise.resolve();
      })
        .then(() => subscriber.complete())
        .catch((err) => subscriber.error(err));
    });
  }

  findOneOrFail(messages: Message[], messageId: string): Message {
    const message = messages.find((m) => m.id === messageId);
    if (!message) {
      throw new Error('Message not found');
    }
    return message;
  }

  getMessages(
    allMessages: Message[],
    parentMessageId: string,
  ): Record<string, any>[] {
    const messages: Message[] = [];
    let parentId: string | undefined = parentMessageId;
    while (parentId) {
      const message = this.findOneOrFail(allMessages, parentId);
      messages.unshift(message);
      parentId = message.parentId;
    }
    return messages.map((m) => m.message);
  }

  async agentStream(
    user: User,
    body: AgentRequestDto,
  ): Promise<Observable<MessageEvent>> {
    let parentId: string | undefined = undefined;
    let messages: Record<string, any> = [];
    if (body.parent_message_id) {
      parentId = body.parent_message_id;
      const allMessages = await this.messagesService.findAll(
        user,
        body.conversation_id,
      );
      messages = this.getMessages(allMessages, parentId);
    }

    return new Observable<MessageEvent>((subscriber) => {
      const handler = this.agentHandler(body.conversation_id, user, subscriber);
      this.stream(
        '/api/v1/grimoire/ask',
        {
          conversation_id: body.conversation_id,
          query: body.query,
          messages,
          tools: body.tools,
          enable_thinking: body.enable_thinking,
        },
        async (data) => {
          parentId = (await handler(data, parentId)) || parentId;
        },
      )
        .then(() => subscriber.complete())
        .catch((err: Error) =>
          subscriber.error(
            JSON.stringify({
              response_type: 'error',
              message: err.message,
            }),
          ),
        );
    });
  }
}
