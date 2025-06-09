import { MessagesService } from 'src/messages/messages.service';
import { User } from 'src/user/user.entity';
import { Observable, Subscriber } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import {
  Message,
  MessageStatus,
  OpenAIMessage,
  OpenAIMessageRole,
} from 'src/messages/entities/message.entity';
import {
  AgentRequestDto,
  WizardAgentRequestDto,
} from 'src/wizard/dto/agent-request.dto';
import { ResourcesService } from 'src/resources/resources.service';
import { Resource } from 'src/resources/resources.entity';
import { ChatResponse } from 'src/wizard/dto/chat-response.dto';

interface HandlerContext {
  parentId?: string;
  messageId?: string;
  message?: OpenAIMessage;
}

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
    namespaceId: string,
    conversationId: string,
    user: User,
    subscriber: Subscriber<MessageEvent>,
  ): (data: string, context: HandlerContext) => Promise<void> {
    return async (data: string, context: HandlerContext): Promise<void> => {
      const chunk: ChatResponse = JSON.parse(data);

      if (chunk.response_type === 'bos') {
        const message: Message = await this.messagesService.create(
          namespaceId,
          conversationId,
          user,
          {
            message: {
              role: chunk.role,
            },
            parentId: context.parentId,
          },
          false,
        );
        chunk.id = message.id;
        chunk.parentId = message.parentId || undefined;

        if (context.message?.role === OpenAIMessageRole.SYSTEM) {
          chunk.parentId = undefined;
        }

        context.messageId = message.id;
        context.message = message.message;
      } else if (chunk.response_type === 'delta') {
        if (!context.messageId) {
          throw new Error('Message ID is not set in context');
        }
        const message: Message = await this.messagesService.updateDelta(
          context.messageId,
          chunk,
        );

        context.message = message.message;
      } else if (chunk.response_type === 'eos') {
        const message: Message = await this.messagesService.update(
          context.messageId!,
          namespaceId,
          conversationId,
          {
            status: MessageStatus.SUCCESS,
          },
          true,
        );

        context.message = message.message;
        context.parentId = message.id;
        context.messageId = undefined;
      } else if (chunk.response_type === 'done') {
        // Do nothing, this is the end of the stream
      } else if (chunk.response_type === 'error') {
        if (context.messageId) {
          await this.messagesService.update(
            context.messageId,
            namespaceId,
            conversationId,
            {
              status: MessageStatus.FAILED,
            },
            true,
          );
        }

        const err = new Error(chunk.message || 'Unknown error');
        err.name = 'AgentError';
        throw err;
      } else {
        throw new Error(`Unknown response type: ${data}`);
      }
      if (context?.message?.role !== OpenAIMessageRole.SYSTEM) {
        subscriber.next({ data: JSON.stringify(chunk) });
      }
    };
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

  streamError(subscriber: Subscriber<MessageEvent>, err: Error) {
    console.error(err);
    subscriber.error(
      JSON.stringify({
        response_type: 'error',
        error: err.name,
      }),
    );
  }

  async agentStream(
    user: User,
    body: AgentRequestDto,
    mode: 'ask' | 'write' = 'ask',
  ): Promise<Observable<MessageEvent>> {
    let parentId: string | undefined = undefined;
    let messages: Record<string, any>[] = [];
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
        if (tool.name === 'private_search') {
          // for private_search, pass the resource with permission
          if (!tool.resources || tool.resources.length === 0) {
            const resources: Resource[] =
              await this.resourcesService.listAllUserAccessibleResources(
                tool.namespace_id,
                user.id,
              );
            tool.visible_resource_ids = resources.map((r) => r.id);
          } else {
            tool.visible_resource_ids = [];
            tool.visible_resource_ids.push(
              ...(await this.resourcesService.permissionFilter<string>(
                tool.namespace_id,
                user.id,
                tool.resources.map((r) => r.id),
              )),
            );
            for (const resource of tool.resources) {
              if (resource.type === 'folder') {
                const resources: Resource[] =
                  await this.resourcesService.getAllSubResources(
                    tool.namespace_id,
                    resource.id,
                    user.id,
                    false,
                  );
                resource.child_ids = resources.map((r) => r.id);
                tool.visible_resource_ids.push(...resource.child_ids);
              }
            }
          }
        }
      }
    }

    const handlerContext: HandlerContext = {
      parentId,
      messageId: undefined,
    };

    return new Observable<MessageEvent>((subscriber) => {
      const handler = this.agentHandler(
        body.namespace_id,
        body.conversation_id,
        user,
        subscriber,
      );

      const wizardRequestBody: WizardAgentRequestDto = {
        conversation_id: body.conversation_id,
        query: body.query,
        messages,
        tools: body.tools,
        enable_thinking: body.enable_thinking,
        current_cite_cnt: currentCiteCnt,
      };

      this.stream(`/api/v1/wizard/${mode}`, wizardRequestBody, async (data) => {
        await handler(data, handlerContext);
      })
        .then(() => subscriber.complete())
        .catch((err: Error) => this.streamError(subscriber, err));
    });
  }

  async agentStreamWrapper(
    user: User,
    body: AgentRequestDto,
    mode: 'ask' | 'write' = 'ask',
  ): Promise<Observable<MessageEvent>> {
    try {
      return await this.agentStream(user, body, mode);
    } catch (e) {
      return new Observable<MessageEvent>((subscriber) =>
        this.streamError(subscriber, e),
      );
    }
  }
}
