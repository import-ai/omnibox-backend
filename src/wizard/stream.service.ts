import { HttpStatus, Injectable, Logger, MessageEvent } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { I18nService } from 'nestjs-i18n';
import { Span } from 'nestjs-otel';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  Message,
  MessageStatus,
  OpenAIMessage,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';
import {
  AgentRequestDto,
  PrivateSearchResourceDto,
  WizardAgentRequestDto,
  WizardPrivateSearchToolDto,
} from 'omniboxd/wizard/dto/agent-request.dto';
import { ChatResponse } from 'omniboxd/wizard/dto/chat-response.dto';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { Observable, Subscriber } from 'rxjs';

interface HandlerContext {
  parentId?: string;
  messageId?: string;
  message?: OpenAIMessage;
}

interface StreamSession {
  key: string;
  namespaceId: string;
  conversationId: string;
  userId: string;
  subscribers: Set<Subscriber<MessageEvent>>;
  controller: AbortController;
  handlerContext: HandlerContext;
  canceled: boolean;
  finished: boolean;
}

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly streamSessions = new Map<string, StreamSession>();

  constructor(
    private readonly wizardApiService: WizardAPIService,
    private readonly messagesService: MessagesService,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly sharedResourcesService: SharedResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly smartFoldersService: SmartFoldersService,
    private readonly i18n: I18nService,
  ) {}

  @Span('stream')
  async stream(
    namespaceId: string,
    mode: 'ask' | 'write',
    body: WizardAgentRequestDto,
    requestId: string,
    callback: (data: string) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute('agent_request', JSON.stringify(body));
    }

    const response = await this.wizardApiService.createAgentStream(
      namespaceId,
      mode,
      body,
      requestId,
      signal,
    );
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
      try {
        await reader.cancel();
      } catch {
        // reader may already be closed after an AbortSignal.
      }
    }
  }

  agentHandler(
    namespaceId: string,
    conversationId: string,
    userId: string,
    send: (data: string) => void,
  ): (data: string, context: HandlerContext) => Promise<void> {
    return async (data: string, context: HandlerContext): Promise<void> => {
      const chunk: ChatResponse = JSON.parse(data);

      if (chunk.response_type === 'bos') {
        const message: Message = await this.messagesService.create(
          namespaceId,
          conversationId,
          userId || null,
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

        chunk.id = context.messageId;
        delete chunk.attrs?.context;
        context.message = message.message;
      } else if (chunk.response_type === 'eos') {
        chunk.id = context.messageId;
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
      } else if (chunk.response_type === 'metrics') {
        // Do nothing, frontend only
      } else if (chunk.response_type === 'checkpoint') {
        // Checkpoint response always triggered after message done
        const messageId = context.messageId || context.parentId;
        if (!messageId) {
          throw new AppException(
            this.i18n.t('system.errors.messageIdNotSet'),
            'MESSAGE_ID_NOT_SET',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        await this.messagesService.saveCheckpoint(messageId, chunk);
      } else if (chunk.response_type === 'error') {
        if (context.messageId) {
          chunk.id = context.messageId;
          await this.messagesService.updateDelta(context.messageId, {
            response_type: 'delta',
            message: {},
            attrs: {
              error_message: chunk.message,
            },
          });

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
      if (
        chunk.response_type !== 'checkpoint' &&
        context?.message?.role !== OpenAIMessageRole.SYSTEM
      ) {
        send(JSON.stringify(chunk));
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

  streamError(
    subscriber: Subscriber<MessageEvent>,
    error: Error | AppException,
  ) {
    this.logger.error({ error });
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
    }
    subscriber.error(error);
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
      return resources.map((r) => this.toPrivateSearchResource(r));
    }
    const visibleResources: PrivateSearchResourceDto[] =
      await this.namespaceResourcesService.permissionFilter<PrivateSearchResourceDto>(
        namespaceId,
        userId,
        resources,
      );
    for (const resource of resources) {
      if (resource.type === 'folder') {
        const meta = await this.resourcesService.getResourceMeta(
          namespaceId,
          resource.id,
        );
        if (meta?.resourceType === ResourceType.SMART_FOLDER) {
          // Smart folders are virtual — expand via conditions, not parentId
          const children = await this.smartFoldersService.listChildren(
            userId,
            namespaceId,
            resource.id,
          );
          resource.child_ids = children.map((r) => r.id);
          visibleResources.push(
            ...children.map((r) => this.toPrivateSearchResource(r)),
          );
        } else {
          const subResources =
            await this.namespaceResourcesService.getAllSubResourcesByUser(
              userId,
              namespaceId,
              resource.id,
            );
          resource.child_ids = subResources.map((r) => r.id);
          visibleResources.push(
            ...subResources.map((r) => this.toPrivateSearchResource(r)),
          );
        }
      }
    }
    return visibleResources;
  }

  private toPrivateSearchResource(resource: {
    id: string;
    name: string;
    resourceType: ResourceType;
  }): PrivateSearchResourceDto {
    return {
      id: resource.id,
      name: resource.name || '',
      type: this.toPrivateSearchResourceType(resource.resourceType),
    };
  }

  private toPrivateSearchResourceType(
    resourceType: ResourceType,
  ): PrivateSearchResourceDto['type'] {
    if (
      resourceType === ResourceType.FOLDER ||
      resourceType === ResourceType.SMART_FOLDER
    ) {
      return 'folder';
    }
    return 'resource';
  }

  private isPrivateSearchFolder(
    resource: PrivateSearchResourceDto,
    actualResource?: Resource,
  ): boolean {
    return (
      resource.type === 'folder' ||
      actualResource?.resourceType === ResourceType.SMART_FOLDER
    );
  }

  private async safeGetResource(
    namespaceId: string,
    resourceId: string,
  ): Promise<Resource | undefined> {
    try {
      return await this.resourcesService.getResourceOrFail(
        namespaceId,
        resourceId,
      );
    } catch {
      return undefined;
    }
  }

  private async getUserVisibleChildResources(
    namespaceId: string,
    userId: string,
    resource: PrivateSearchResourceDto,
    actualResource?: Resource,
  ): Promise<
    Array<{
      id: string;
      name: string;
      resourceType: ResourceType;
    }>
  > {
    if (actualResource?.resourceType === ResourceType.SMART_FOLDER) {
      return await this.namespaceResourcesService.listChildren(
        namespaceId,
        resource.id,
        userId,
        {},
      );
    }
    return await this.namespaceResourcesService.getAllSubResourcesByUser(
      userId,
      namespaceId,
      resource.id,
    );
  }

  private async getShareVisibleResources(
    share: Share,
    reqResources: PrivateSearchResourceDto[],
  ): Promise<PrivateSearchResourceDto[]> {
    if (reqResources.length === 0) {
      const resources =
        await this.sharedResourcesService.getAllSharedResources(share);
      return resources.map((r) => this.toPrivateSearchResource(r));
    }

    const visibleResources: PrivateSearchResourceDto[] = [...reqResources];
    for (const reqResource of reqResources) {
      // Check if the resource is in the share
      const resource = await this.sharedResourcesService.getAndValidateResource(
        share,
        reqResource.id,
      );
      if (reqResource.type === 'folder') {
        const subResources =
          resource.resourceType === ResourceType.SMART_FOLDER
            ? await this.sharedResourcesService.getSharedResourceChildren(
                share,
                reqResource.id,
              )
            : await this.resourcesService.getChildren(share.namespaceId, [
                reqResource.id,
              ]);
        reqResource.child_ids = subResources.map((r) => r.id);
        visibleResources.push(
          ...subResources.map((r) => this.toPrivateSearchResource(r)),
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
    userId: string,
    shareId: string = '',
  ): Promise<Observable<MessageEvent>> {
    let parentId: string | undefined = undefined;
    let messages: Message[] = [];
    if (requestDto.parent_message_id) {
      parentId = requestDto.parent_message_id;
      const allMessages = await this.messagesService.findAll(
        userId,
        requestDto.conversation_id,
      );
      messages = this.getMessages(allMessages, parentId);
    }

    const key = this.getStreamKey(
      namespaceId,
      requestDto.conversation_id,
      userId,
      shareId,
    );

    return new Observable<MessageEvent>((subscriber) => {
      const session =
        this.streamSessions.get(key) ||
        this.startAgentSession(
          key,
          namespaceId,
          requestDto,
          requestId,
          mode,
          userId,
          shareId,
          parentId,
          messages,
        );
      return this.attachSession(session, subscriber);
    });
  }

  private getStreamKey(
    namespaceId: string,
    conversationId: string,
    userId: string,
    shareId = '',
  ): string {
    return `${shareId ? `share:${shareId}` : `user:${userId}`}:${namespaceId}:${conversationId}`;
  }

  private startAgentSession(
    key: string,
    namespaceId: string,
    requestDto: AgentRequestDto,
    requestId: string,
    mode: 'ask' | 'write',
    userId: string,
    shareId: string,
    parentId: string | undefined,
    messages: Message[],
  ): StreamSession {
    const session: StreamSession = {
      key,
      namespaceId,
      conversationId: requestDto.conversation_id,
      userId,
      subscribers: new Set(),
      controller: new AbortController(),
      handlerContext: { parentId },
      canceled: false,
      finished: false,
    };
    this.streamSessions.set(key, session);

    const handler = this.agentHandler(
      namespaceId,
      requestDto.conversation_id,
      userId,
      (data) => this.sendSessionData(session, data),
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
      user_id: userId,
      conversation_id: requestDto.conversation_id,
      query: requestDto.query,
      messages,
      tools,
      enable_thinking: requestDto.enable_thinking,
      lang: requestDto.lang,
      tool_call: requestDto.tool_call,
      channel: requestDto.channel,
      share_id: shareId,
    };

    void this.stream(
      namespaceId,
      mode,
      wizardRequest,
      requestId,
      async (data) => {
        if (session.finished || session.canceled) return;
        await handler(data, session.handlerContext);
      },
      session.controller.signal,
    )
      .then(() => this.completeSession(session))
      .catch((err: Error) => {
        if (session.canceled || session.controller.signal.aborted) {
          this.completeSession(session);
          return;
        }
        this.errorSession(session, err);
      });

    return session;
  }

  private attachSession(
    session: StreamSession,
    subscriber: Subscriber<MessageEvent>,
  ) {
    if (session.finished) {
      subscriber.complete();
      return;
    }
    session.subscribers.add(subscriber);
    return () => {
      session.subscribers.delete(subscriber);
    };
  }

  private sendSessionData(session: StreamSession, data: string) {
    if (session.finished) return;
    for (const subscriber of session.subscribers) {
      if (!subscriber.closed) {
        subscriber.next({ data });
      }
    }
  }

  private completeSession(session: StreamSession) {
    if (session.finished) return;
    session.finished = true;
    for (const subscriber of session.subscribers) {
      if (!subscriber.closed) {
        subscriber.complete();
      }
    }
    session.subscribers.clear();
    this.streamSessions.delete(session.key);
  }

  private errorSession(session: StreamSession, error: Error) {
    this.logger.error({ error });
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
    }
    for (const subscriber of session.subscribers) {
      if (!subscriber.closed) {
        subscriber.error(error);
      }
    }
    this.completeSession(session);
  }

  private async stopSession(session: StreamSession) {
    if (session.finished) return;
    session.canceled = true;
    session.controller.abort();
    const [message] = await this.messagesService.stopRunning(
      session.namespaceId,
      session.conversationId,
      session.userId,
    );
    const stoppedMessageId = session.handlerContext.messageId ?? message?.id;
    this.sendSessionData(
      session,
      JSON.stringify({
        response_type: 'stopped',
        id: stoppedMessageId,
      }),
    );
    this.completeSession(session);
  }

  resumeUserAgentStream(
    userId: string,
    namespaceId: string,
    conversationId: string,
  ): Observable<MessageEvent> {
    return this.resumeAgentStream(
      this.getStreamKey(namespaceId, conversationId, userId),
    );
  }

  resumeShareAgentStream(
    share: Share,
    conversationId: string,
  ): Observable<MessageEvent> {
    return this.resumeAgentStream(
      this.getStreamKey(share.namespaceId, conversationId, '', share.id),
    );
  }

  private resumeAgentStream(key: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const session = this.streamSessions.get(key);
      if (!session) {
        subscriber.complete();
        return;
      }
      return this.attachSession(session, subscriber);
    });
  }

  async cancelUserAgentStream(
    userId: string,
    namespaceId: string,
    conversationId: string,
  ) {
    await this.cancelAgentStream(
      this.getStreamKey(namespaceId, conversationId, userId),
      namespaceId,
      conversationId,
      userId,
    );
  }

  async cancelShareAgentStream(share: Share, conversationId: string) {
    await this.cancelAgentStream(
      this.getStreamKey(share.namespaceId, conversationId, '', share.id),
      share.namespaceId,
      conversationId,
      '',
    );
  }

  private async cancelAgentStream(
    key: string,
    namespaceId: string,
    conversationId: string,
    userId: string,
  ) {
    const session = this.streamSessions.get(key);
    if (session) {
      await this.stopSession(session);
      return;
    }
    await this.messagesService.stopRunning(namespaceId, conversationId, userId);
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
        '',
        share.id,
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
