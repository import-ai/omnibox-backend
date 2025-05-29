import { MessagesService } from 'src/messages/messages.service';
import { User } from 'src/user/user.entity';
import { Observable, Subscriber } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { Message } from 'src/messages/entities/message.entity';
import { AgentRequestDto } from 'src/wizard/dto/agent-request.dto';
import { ResourcesService } from 'src/resources/resources.service';
import { Resource } from 'src/resources/resources.entity';

export class StreamService {
  constructor(
    private readonly wizardBaseUrl: string,
    private readonly messagesService: MessagesService,
    private readonly resourcesService: ResourcesService,
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
        message: { role: string };
        attrs?: Record<string, any>;
      };

      if (chunk.response_type === 'openai_message') {
        const message: Message = await this.messagesService.create(
          conversationId,
          user,
          { message: chunk.message, parentId, attrs: chunk?.attrs },
        );
        if (chunk.message.role === 'tool' && chunk?.attrs) {
          const attrs = chunk.attrs;
          if (attrs?.citations) {
            subscriber.next({
              data: JSON.stringify({
                response_type: 'citations',
                citations: attrs.citations,
              }),
            });
          }
        }
        if (chunk.message.role !== 'system') {
          subscriber.next({
            data: JSON.stringify({
              response_type: 'end_of_message',
              role: chunk.message.role,
              messageId: message.id,
            }),
          });
        }
        return message.id;
      }
      subscriber.next({ data });
      return undefined;
    };
  }

  chatStream(body: Record<string, any>): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      this.stream('/api/v1/wizard/stream', body, (data) => {
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
  ): { messages: Record<string, any>[]; currentCiteCnt: number } {
    const messages: Message[] = [];
    let currentCiteCnt: number = 0;
    let parentId: string | undefined = parentMessageId;
    while (parentId) {
      const message = this.findOneOrFail(allMessages, parentId);
      const attrs = message.attrs as { citations: Record<string, any>[] };
      if (attrs?.citations) {
        currentCiteCnt += attrs.citations.length;
      }
      messages.unshift(message);
      parentId = message.parentId;
    }
    return { messages: messages.map((m) => m.message), currentCiteCnt };
  }

  async agentStream(
    user: User,
    body: AgentRequestDto,
  ): Promise<Observable<MessageEvent>> {
    let parentId: string | undefined = undefined;
    let messages: Record<string, any> = [];
    let currentCiteCnt: number = 0;
    if (body.parent_message_id) {
      parentId = body.parent_message_id;
      const allMessages = await this.messagesService.findAll(
        user.id,
        body.conversation_id,
      );
      const buf = this.getMessages(allMessages, parentId);
      messages = buf.messages;
      currentCiteCnt = buf.currentCiteCnt;
    }

    if (body.tools) {
      for (const tool of body.tools) {
        if (tool.name === 'knowledge_search') {
          // for knowledge_search, pass the resource with permission
          if (
            tool.resource_ids === undefined &&
            tool.parent_ids === undefined
          ) {
            const resources: Resource[] =
              await this.resourcesService.listAllUserAccessibleResources(
                tool.namespace_id,
                user.id,
              );
            tool.resource_ids = resources.map((r) => r.id);
          } else {
            const resourceIds: string[] = [];
            if (tool.resource_ids) {
              resourceIds.push(
                ...(await this.resourcesService.permissionFilter<string>(
                  tool.namespace_id,
                  user.id,
                  resourceIds,
                )),
              );
            }
            if (tool.parent_ids) {
              for (const parentId of tool.parent_ids) {
                const resources: Resource[] =
                  await this.resourcesService.getAllSubResources(
                    tool.namespace_id,
                    parentId,
                    user.id,
                    true,
                  );
                resourceIds.push(...resources.map((res) => res.id));
              }
              tool.parent_ids = undefined;
            }
            tool.resource_ids = resourceIds;
          }
        }
      }
    }

    return new Observable<MessageEvent>((subscriber) => {
      const handler = this.agentHandler(body.conversation_id, user, subscriber);
      this.stream(
        '/api/v1/wizard/ask',
        {
          conversation_id: body.conversation_id,
          query: body.query,
          messages,
          tools: body.tools,
          enable_thinking: body.enable_thinking,
          current_cite_cnt: currentCiteCnt,
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
