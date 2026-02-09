import { MessagesService } from 'omniboxd/messages/messages.service';
import { Observable, Subscriber } from 'rxjs';
import { HttpStatus, Logger, MessageEvent } from '@nestjs/common';
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
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { ChatResponse } from 'omniboxd/wizard/dto/chat-response.dto';
import { context, propagation, trace } from '@opentelemetry/api';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { Span } from 'nestjs-otel';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

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
    private readonly i18n: I18nService,
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
      const message = this.i18n.t('system.errors.wizardRequestFailed');
      throw new AppException(
        message,
        'WIZARD_REQUEST_FAILED',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const reader = response.body?.getReader();
    if (!reader) {
      const message = this.i18n.t('system.errors.responseBodyNotReadable');
      throw new AppException(
        message,
        'RESPONSE_BODY_NOT_READABLE',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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

        context.messageId = message.id;
        context.message = message.message;
      } else if (chunk.response_type === 'delta') {
        if (!context.messageId) {
          const message = this.i18n.t('system.errors.messageIdNotSet');
          throw new AppException(
            message,
            'MESSAGE_ID_NOT_SET',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
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
        const message = this.i18n.t('system.errors.unknownResponseType', {
          args: { type: data },
        });
        throw new AppException(
          message,
          'UNKNOWN_RESPONSE_TYPE',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (context?.message?.role !== OpenAIMessageRole.SYSTEM) {
        subscriber.next({ data: JSON.stringify(chunk) });
      }
    };
  }

  findOneOrFail(messages: Message[], messageId: string): Message {
    const message = messages.find((m) => m.id === messageId);
    if (!message) {
      const errorMessage = this.i18n.t('system.errors.messageNotFound');

      throw new AppException(
        errorMessage,
        'MESSAGE_NOT_FOUND',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
      const resources =
        await this.namespaceResourcesService.getAllResourcesByUser(
          userId,
          namespaceId,
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
          await this.namespaceResourcesService.getAllSubResourcesByUser(
            userId,
            namespaceId,
            resource.id,
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
        const subResources = await this.resourcesService.getChildren(
          share.namespaceId,
          [reqResource.id],
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
        if (tool.name === 'private_search') {
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
        if (tool.name === 'private_search') {
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
    const observable = await this.createUserAgentStream(
      userId,
      namespaceId,
      body,
      requestId,
      mode,
    );

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
