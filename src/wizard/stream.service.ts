import { MessagesService } from 'omniboxd/messages/messages.service';
import { Observable, Subscriber } from 'rxjs';
import { Logger, MessageEvent } from '@nestjs/common';
import {
  Message,
  MessageStatus,
  OpenAIMessage,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import {
  AgentRequestDto,
  PrivateSearchResourceDto,
  WizardAgentRequestDto,
  WizardPrivateSearchToolDto,
} from 'omniboxd/wizard/dto/agent-request.dto';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ChatResponse } from 'omniboxd/wizard/dto/chat-response.dto';
import { context, propagation, trace } from '@opentelemetry/api';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { Span } from 'nestjs-otel';

interface HandlerContext {
  parentId?: string;
  messageId?: string;
  message?: OpenAIMessage;
}

export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor(
    private readonly wizardBaseUrl: string,
    private readonly messagesService: MessagesService,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly sharedResourcesService: SharedResourcesService,
    private readonly resourcesService: ResourcesService,
  ) {}

  @Span('stream')
  async stream(
    url: string,
    body: Record<string, any>,
    requestId: string,
    callback: (data: string) => Promise<void>,
  ): Promise<void> {
    const span = trace.getSpan(context.active());
    if (span) {
      span.setAttribute('agent_request', JSON.stringify(body));
    }

    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);
    const response = await fetch(`${this.wizardBaseUrl}${url}`, {
      method: 'POST',
      headers: {
        ...traceHeaders,
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
      },
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
    userId: string | null,
    subscriber: Subscriber<MessageEvent>,
  ): (data: string, context: HandlerContext) => Promise<void> {
    return async (data: string, context: HandlerContext): Promise<void> => {
      const chunk: ChatResponse = JSON.parse(data);

      if (chunk.response_type === 'bos') {
        const message: Message = await this.messagesService.create(
          namespaceId,
          conversationId,
          userId,
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
        chunk.userId = userId || undefined;
        chunk.namespaceId = namespaceId;

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

  getMessages(allMessages: Message[], parentMessageId: string): Message[] {
    const messages: Message[] = [];
    let parentId: string | null = parentMessageId;
    while (parentId) {
      const message = this.findOneOrFail(allMessages, parentId);
      messages.unshift(message);
      parentId = message.parentId;
    }
    return messages;
  }

  streamError(subscriber: Subscriber<MessageEvent>, error: Error) {
    this.logger.error({ error });
    subscriber.error(
      JSON.stringify({
        response_type: 'error',
        error: error.name,
      }),
    );
  }

  private async getUserVisibleResources(
    namespaceId: string,
    userId: string,
    resources: PrivateSearchResourceDto[],
  ): Promise<PrivateSearchResourceDto[]> {
    // for private_search, pass the resource with permission
    if (resources.length === 0) {
      const resources: Resource[] =
        await this.namespaceResourcesService.listAllUserAccessibleResources(
          namespaceId,
          userId,
        );
      return resources.map((r) => {
        return {
          id: r.id,
          name: r.name || '',
          type: r.resourceType === ResourceType.FOLDER ? 'folder' : 'resource',
        } as PrivateSearchResourceDto;
      });
    }
    const visibleResources: PrivateSearchResourceDto[] =
      await this.namespaceResourcesService.permissionFilter<PrivateSearchResourceDto>(
        namespaceId,
        userId,
        resources,
      );
    for (const resource of resources) {
      if (resource.type === 'folder') {
        const resources =
          await this.namespaceResourcesService.getSubResourcesByUser(
            namespaceId,
            resource.id,
            userId,
          );
        resource.child_ids = resources.map((r) => r.id);
        visibleResources.push(
          ...resources.map((r) => {
            return {
              id: r.id,
              name: r.name || '',
              type:
                r.resourceType === ResourceType.FOLDER ? 'folder' : 'resource',
            } as PrivateSearchResourceDto;
          }),
        );
      }
    }
    return visibleResources;
  }

  private async getShareVisibleResources(
    share: Share,
    reqResources: PrivateSearchResourceDto[],
  ): Promise<PrivateSearchResourceDto[]> {
    if (reqResources.length === 0) {
      const resources =
        await this.sharedResourcesService.getAllSharedResources(share);
      return resources.map((r) => {
        return {
          id: r.id,
          name: r.name || '',
          type: r.resourceType === ResourceType.FOLDER ? 'folder' : 'resource',
        } as PrivateSearchResourceDto;
      });
    }

    const visibleResources: PrivateSearchResourceDto[] = [...reqResources];
    for (const reqResource of reqResources) {
      // Check if the resource is in the share
      await this.sharedResourcesService.getAndValidateResource(
        share,
        reqResource.id,
      );
      if (reqResource.type === 'folder') {
        const subResources = await this.resourcesService.getSubResources(
          share.namespaceId,
          reqResource.id,
        );
        reqResource.child_ids = subResources.map((r) => r.id);
        visibleResources.push(
          ...subResources.map((r) => {
            return {
              id: r.id,
              name: r.name || '',
              type:
                r.resourceType === ResourceType.FOLDER ? 'folder' : 'resource',
            } as PrivateSearchResourceDto;
          }),
        );
      }
    }
    return visibleResources;
  }

  private async createAgentStream(
    namespaceId: string,
    requestDto: AgentRequestDto,
    requestId: string,
    mode: 'ask' | 'write',
    userId: string | null,
  ): Promise<Observable<MessageEvent>> {
    let parentId: string | undefined = undefined;
    let messages: Message[] = [];
    if (requestDto.parent_message_id) {
      parentId = requestDto.parent_message_id;
      const allMessages = await this.messagesService.findAll(
        userId || undefined,
        requestDto.conversation_id,
      );
      messages = this.getMessages(allMessages, parentId);
    }

    const handlerContext: HandlerContext = {
      parentId,
      messageId: undefined,
    };

    return new Observable<MessageEvent>((subscriber) => {
      const handler = this.agentHandler(
        namespaceId,
        requestDto.conversation_id,
        userId,
        subscriber,
      );

      const tools = (requestDto.tools || []).map((tool) => {
        if (tool.name === 'private_search') {
          return {
            ...tool,
            namespace_id: namespaceId,
          } as WizardPrivateSearchToolDto;
        }
        return tool;
      });

      const wizardRequest: WizardAgentRequestDto = {
        namespace_id: namespaceId,
        conversation_id: requestDto.conversation_id,
        query: requestDto.query,
        messages,
        tools,
        enable_thinking: requestDto.enable_thinking,
        lang: requestDto.lang,
      };

      this.stream(
        `/api/v1/wizard/${mode}`,
        wizardRequest,
        requestId,
        async (data) => {
          await handler(data, handlerContext);
        },
      )
        .then(() => subscriber.complete())
        .catch((err: Error) => this.streamError(subscriber, err));
    });
  }

  async createUserAgentStream(
    userId: string,
    namespaceId: string,
    requestDto: AgentRequestDto,
    requestId: string,
    mode: 'ask' | 'write',
  ): Promise<Observable<MessageEvent>> {
    try {
      for (const tool of requestDto.tools || []) {
        if (tool.name == 'private_search') {
          tool.visible_resources = await this.getUserVisibleResources(
            namespaceId,
            userId,
            tool.resources || [],
          );
        }
      }
      return this.createAgentStream(
        namespaceId,
        requestDto,
        requestId,
        mode,
        userId,
      );
    } catch (e) {
      return new Observable<MessageEvent>((subscriber) =>
        this.streamError(subscriber, e),
      );
    }
  }

  async createShareAgentStream(
    share: Share,
    requestDto: AgentRequestDto,
    requestId: string,
    mode: 'ask' | 'write',
  ): Promise<Observable<MessageEvent>> {
    try {
      for (const tool of requestDto.tools || []) {
        if (tool.name == 'private_search') {
          tool.visible_resources = await this.getShareVisibleResources(
            share,
            tool.resources || [],
          );
        }
      }
      return this.createAgentStream(
        share.namespaceId,
        requestDto,
        requestId,
        mode,
        null,
      );
    } catch (e) {
      return new Observable<MessageEvent>((subscriber) =>
        this.streamError(subscriber, e),
      );
    }
  }

  async chat(
    userId: string,
    namespaceId: string,
    body: AgentRequestDto,
    requestId: string,
    mode: 'ask' | 'write' = 'ask',
  ): Promise<any> {
    const observable = await this.createUserAgentStream(userId, namespaceId, body, requestId, mode);

    const chunks: ChatResponse[] = [];

    return new Promise((resolve, reject) => {
      observable.subscribe({
        next: (event: MessageEvent) => {
          const chunk: ChatResponse = JSON.parse(event.data as string);
          chunks.push(chunk);
        },
        complete: () => {
          resolve(chunks);
        },
        error: (error: Error) => {
          reject(error);
        },
      });
    });
  }
}
