import {
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { trace } from '@opentelemetry/api';
import { isUUID } from 'class-validator';
import { createHash, randomUUID } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { Span } from 'nestjs-otel';
import {
  AGENT_STREAM_HOOKS,
  AgentStream,
  AgentTokenUsage,
  IAgentStreamHooks,
} from 'omniboxd/agent-stream-hooks/agent-stream-hooks.interface';
import { BehaviorService } from 'omniboxd/behavior/behavior.service';
import {
  type BehaviorContext,
  behaviorContext,
} from 'omniboxd/behavior/behavior-context';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import {
  AnswerTimingRun,
  endAnswerTiming,
  finishAnswerTiming,
  startAnswerTiming,
} from 'omniboxd/messages/answer-timing';
import {
  Message,
  MessageAttrs,
  MessageStatus,
  OpenAIMessage,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { MessagesService } from 'omniboxd/messages/messages.service';
import {
  toPrivateSearchResource,
  VisibleResourcesService,
} from 'omniboxd/namespace-resources/visible-resources.service';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import {
  attrsForVisitor,
  messageForVisitor,
} from 'omniboxd/shares/chat-only-payload';
import { Share, ShareType } from 'omniboxd/shares/entities/share.entity';
import { ShareAccessTokenService } from 'omniboxd/shares/share-access-token.service';
import { TraceService } from 'omniboxd/trace/trace.service';
import {
  chatErrorCategory,
  chatErrorGroup,
} from 'omniboxd/wizard/chat-error-trace';
import {
  AgentRequestDto,
  PrivateSearchResourceDto,
  PrivateSearchToolDto,
  WebSearchToolDto,
  WizardAgentRequestDto,
  WizardPrivateSearchToolDto,
} from 'omniboxd/wizard/dto/agent-request.dto';
import {
  ChatErrorResponse,
  ChatResponse,
} from 'omniboxd/wizard/dto/chat-response.dto';
import {
  BEGIN_PENDING_SAVE,
  END_PENDING_SAVE,
  IS_SAVE_PENDING,
  SAVE_GATE_SAFETY_TTL_SECONDS,
  saveGateKey,
} from 'omniboxd/wizard/save-gate';
import { getStreamKey } from 'omniboxd/wizard/stream-key';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { WizardBaseUrlResolution } from 'omniboxd/wizard-url-provider/wizard-url-provider.interface';
import { commandOptions, createClient } from 'redis';
import {
  filter,
  firstValueFrom,
  lastValueFrom,
  map,
  Observable,
  Subscriber,
} from 'rxjs';

import { ConversationAttachmentsService } from '../attachments/conversation-attachments.service';
import { NamespaceResourcesService } from '../namespace-resources/namespace-resources.service';
import { coalesceTextDeltas } from './coalesce-text-deltas';
import {
  ConversationSubmission,
  ConversationSubmissions,
  submissionFingerprint,
  SubmissionReceipt,
} from './conversation-submissions';
import {
  APPEND_STEER,
  decodeSteerItem,
  prepareSteer,
  READ_STEER,
  READ_STEER_INPUT,
} from './steer';

const STREAM_TTL_SECONDS = 60 * 60;
const STREAM_BLOCK_MS = 15000;
const STREAM_MAXLEN = 10000;
const STREAM_START_ID = '0-0';
// How long the save stop waits for a just-registered session to persist its
// query row (and run identity) before evaluating what to stop.
const STOP_ADMISSION_WAIT_MS = 5_000;

type RedisStreamReadResult = Array<[string, Array<[string, string[]]>]> | null;
type RedisClient = ReturnType<typeof createClient>;

function isPrivateSearchTool(
  tool: PrivateSearchToolDto | WebSearchToolDto,
): tool is PrivateSearchToolDto {
  return tool.name === 'private_search';
}

// A failure in stream()'s preflight (target resolution and eager expansion),
// which happens before the wizard is called. The Open API answers these with
// the original HTTP status and code instead of an in-stream error.
const agentPreflightErrors = new WeakSet<Error>();

function markAgentPreflight(error: unknown): unknown {
  if (error instanceof Error) {
    agentPreflightErrors.add(error);
  }
  return error;
}

function isAgentPreflight(error: unknown): error is Error {
  return error instanceof Error && agentPreflightErrors.has(error);
}

/**
 * Actions of interrupted runs that a decision turn resumes. The interrupted
 * run's last row was finalized as `paused`, so its behavior id only appears
 * on that row; completing those actions at the resumed run's outcome keeps a
 * send paused for approval from staying pending forever.
 */
export function collectPausedResumeBehaviors(
  messages: Message[],
  userId: string,
  excludeActionId?: string,
): BehaviorContext[] {
  // Collect every paused initiating action in the chain the decision resumes,
  // including earlier pauses of a multi-pause flow. The terminal-transition
  // rule in BehaviorService.result is what prevents a re-submitted settled
  // action from being flipped; only an explicit retry of a failed action may
  // correct it. Steered actions settle through their own path.
  const steeredActions = new Set<string>();
  for (const message of messages) {
    if (message.message.role !== OpenAIMessageRole.USER) continue;
    const id = message.attrs?.behavior_action_id;
    if (typeof id === 'string' && id && message.attrs?.client_request_id)
      steeredActions.add(id);
  }
  const seen = new Set<string>();
  const behaviors: BehaviorContext[] = [];
  for (const message of messages) {
    if (message.message.role === OpenAIMessageRole.USER) continue;
    const id = message.attrs?.behavior_action_id;
    if (typeof id !== 'string' || !id || id === excludeActionId) continue;
    if (message.attrs?.answer_timing?.status !== 'paused') continue;
    if (steeredActions.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    behaviors.push({
      action_id: id,
      action_type: 'ai_conversation',
      action_started_at: '',
      origin_platform: '',
      user_id: userId,
      task_ids: [],
    });
  }
  return behaviors;
}

interface HandlerContext {
  behavior?: BehaviorContext;
  /** Steered sends of this run that still need an assistant turn. */
  steeredQueue?: BehaviorContext[];
  /** The steered send owning the assistant rows currently open. */
  assistantSteeredBehavior?: BehaviorContext;
  /** Steered behaviors seen in this run that are not completed yet. */
  pendingSteered?: Map<
    string,
    { behavior: BehaviorContext; lastAssistantRowId?: string }
  >;
  /** Initiating behaviors of the interrupted runs this decision turn resumes. */
  resumeBehaviors?: BehaviorContext[];
  /** The initial turn's last assistant row, finalized at the run outcome. */
  initialTurnRowId?: string;
  initialTurnCaptured?: boolean;
  answerTiming?: AnswerTimingRun;
  timingFinalized?: boolean;
  lastEos?: {
    message: Message;
    endedAt: Date;
    monotonic: number;
    firstContentAt?: number;
  };
  runId?: string;
  canSteer?: boolean;
  stopped?: boolean;
  failed?: boolean;
  interrupted?: boolean;
  queryId?: string;
  parentId?: string;
  messageId?: string;
  message?: OpenAIMessage;
  toolCalls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
  answeredToolCallIds?: Set<string>;
  channel?: string;
  platform?: string;
  clientVersion?: string;
  clientBuild?: string;
  shareId?: string;
  queryReceivedAt?: number;
  roundFirstContentAt?: number;
  mode?: 'ask' | 'write';
  firstTokenTraceReported?: boolean;
}

interface StreamSession {
  key: string;
  namespaceId: string;
  conversationId: string;
  userId: string;
  /** The share the stream arrived through, empty for a signed-in member. */
  shareId: string;
  channel?: string;
  platform?: string;
  clientVersion?: string;
  clientBuild?: string;
  subscribers: Set<Subscriber<MessageEvent>>;
  events: string[];
  controller: AbortController;
  handlerContext: HandlerContext;
  finished: boolean;
  steerToken?: string;
  steerStopSupported?: boolean;
  drainUsage?: boolean;
}

interface ChatClientTraceContext {
  platform?: string;
  clientVersion?: string;
  clientBuild?: string;
}

interface ChatErrorTraceContext extends ChatClientTraceContext {
  userId?: string;
  namespaceId?: string;
  conversationId?: string;
  requestId?: string;
  messageId?: string;
  channel?: string;
  shareId?: string;
  parentMessageId?: string;
  stage?: string;
  clientState?: string;
  userVisible?: boolean;
}

/** The hook-facing view of a live session. */
function agentStreamOf(session: StreamSession): AgentStream {
  return {
    namespaceId: session.namespaceId,
    streamId: session.key,
    shareId: session.shareId || undefined,
  };
}

export type StopStreamOutcome =
  | 'idle'
  | 'pausing'
  | 'unknown'
  | 'stopped'
  | 'closed'
  | 'unconfirmed';

@Injectable()
export class StreamService implements OnModuleDestroy {
  private readonly logger = new Logger(StreamService.name);
  private readonly streamSessions = new Map<string, StreamSession>();
  private readonly reportedChatErrors = new Map<string, number>();
  private redisClient: RedisClient | null = null;
  private redisSubscriber: RedisClient | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly wizardApiService: WizardAPIService,
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
    private readonly visibleResourcesService: VisibleResourcesService,
    private readonly sharedResourcesService: SharedResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly i18n: I18nService,
    private readonly shareAccessTokenService: ShareAccessTokenService,
    @Inject(AGENT_STREAM_HOOKS)
    private readonly agentStreamHooks: IAgentStreamHooks,
    @Optional()
    private readonly traceService?: TraceService,
    @Optional() private readonly behaviorService?: BehaviorService,
    private readonly steerAttachments?: ConversationAttachmentsService,
    private readonly steerResources?: NamespaceResourcesService,
  ) {}

  async onModuleDestroy() {
    await Promise.all([
      this.redisSubscriber?.isOpen ? this.redisSubscriber.quit() : undefined,
      this.redisClient?.isOpen ? this.redisClient.quit() : undefined,
    ]);
  }

  private async createRedisConnection(): Promise<RedisClient | null> {
    const redisUrl = this.configService.get<string>('OBB_REDIS_URL');
    if (!redisUrl) {
      return null;
    }
    const client = createClient({ url: redisUrl });
    client.on('error', (error) => this.logger.error({ error }));
    try {
      await client.connect();
      return client;
    } catch (error) {
      this.logger.error({ error });
      return null;
    }
  }

  private async getRedisClient(): Promise<RedisClient | null> {
    if (this.redisClient?.isOpen) {
      return this.redisClient;
    }
    this.redisClient = await this.createRedisConnection();
    return this.redisClient;
  }

  private async getRedisSubscriber(): Promise<RedisClient | null> {
    if (this.redisSubscriber?.isOpen) {
      return this.redisSubscriber;
    }
    this.redisSubscriber = await this.createRedisConnection();
    return this.redisSubscriber;
  }

  private streamEventsKey(key: string): string {
    return `wizard:stream:${key}:events`;
  }

  private streamActiveKey(key: string): string {
    return `wizard:stream:${key}:active`;
  }

  private streamCancelKey(key: string): string {
    return `wizard:stream:${key}:cancel`;
  }

  private streamSequenceKey(key: string): string {
    return `wizard:stream:${key}:seq`;
  }

  private streamControlChannel(key: string): string {
    return `wizard:stream:${key}:control`;
  }

  private conversationLockKey(
    namespaceId: string,
    conversationId: string,
  ): string {
    return `wizard:lock:conversation:${namespaceId}:${conversationId}`;
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  @Span('stream')
  async stream(
    namespaceId: string,
    mode: 'ask' | 'write',
    body: WizardAgentRequestDto,
    requestId: string,
    callback: (data: string) => Promise<void>,
    signal?: AbortSignal,
    agentStream?: AgentStream,
  ): Promise<void> {
    let resolution: WizardBaseUrlResolution | undefined;
    if (mode === 'ask' && !body.share_id) {
      try {
        resolution = await this.wizardApiService.resolveAgentTarget(
          namespaceId,
          body,
        );
        // Only Agent 1.1 needs the eager expansion; Agent 2.1 resolves the same
        // list lazily on its own resource_search call.
        if (resolution.target !== 'pro') {
          body.tools =
            (await this.expandVisibleResources(
              namespaceId,
              body.user_id,
              body.tools,
            )) ?? body.tools;
        }
      } catch (error) {
        throw markAgentPreflight(error);
      }
    }
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute(
        'agent_request',
        JSON.stringify({ ...body, share_access_token: undefined }),
      );
    }

    const session =
      agentStream && this.streamSessions.get(agentStream.streamId);
    const redis =
      resolution?.target === 'pro' && session && !session.shareId
        ? await this.getRedisClient()
        : null;
    if (redis && session) {
      session.steerToken = randomUUID();
    }
    const response = await this.wizardApiService.createAgentStream(
      namespaceId,
      mode,
      body,
      requestId,
      signal,
      resolution,
      session?.steerToken,
    );
    if (!response.ok) {
      const message = this.i18n.t('system.errors.wizardRequestFailed');
      throw new AppException(
        message,
        'WIZARD_REQUEST_FAILED',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (
      redis &&
      session?.steerToken &&
      response.headers.get('x-accept-steer') === '1'
    ) {
      const inbox = 'wizard:steer:' + session.steerToken;
      const queue = await this.submissionQueue();
      await redis
        .multi()
        .set(`wizard:steer-active:${session.key}`, requestId, {
          EX: STREAM_TTL_SECONDS,
        })
        .hSet(inbox, {
          open: '1',
          running: '1',
          run: requestId,
          ...(queue ? { queue: queue.key(session.key) } : {}),
          save_gate: saveGateKey(session.key),
          previous_run:
            body.messages?.findLast((m) => m.attrs?.turn_run_id)?.attrs
              ?.turn_run_id ?? '',
        })
        .expire(inbox, STREAM_TTL_SECONDS)
        .set(
          `wizard:steer-route:${session.key}:${requestId}`,
          session.steerToken,
          { EX: STREAM_TTL_SECONDS },
        )
        .exec();
      session.handlerContext.canSteer = true;
      session.steerStopSupported =
        response.headers.get('x-accept-steer-stop') === '1';
    }
    if (agentStream) {
      try {
        await this.agentStreamHooks.onStreamStarted?.(agentStream, response);
      } catch (error) {
        await response.body?.cancel();
        throw error;
      }
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

        const frames: string[] = [];
        while (true) {
          const lineEnd = buffer.indexOf('\n');
          if (lineEnd == -1) break;

          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            frames.push(data);
          }
        }
        for (const frame of session?.steerToken
          ? coalesceTextDeltas(frames)
          : frames) {
          await callback(frame);
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

  /**
   * Citations and tool-call args name the resources behind an answer. A
   * chat-only share lends those to the assistant, never to the visitor, so
   * they are dropped on the way out while staying in the stored message.
   */
  private forVisitor(chunk: ChatResponse, chatOnly: boolean): ChatResponse {
    if (!chatOnly) {
      return chunk;
    }
    // Only these two carry a payload; the rest of the union has nothing to strip.
    if (chunk.response_type === 'bos') {
      return { ...chunk, attrs: attrsForVisitor(chunk.attrs) };
    }
    if (chunk.response_type === 'delta') {
      return {
        ...chunk,
        attrs: attrsForVisitor(chunk.attrs),
        message: messageForVisitor(chunk.message),
      };
    }
    return chunk;
  }

  /**
   * Report one finished LLM call. A message is one call, and MessagesService
   * accumulates its tokens as the deltas arrive, so the persisted row is what
   * gets reported - no in-flight state to lose if the stream dies, and the
   * hook can key its own bookkeeping on the message id.
   */
  private reportCallCompleted(message: Message, stream?: AgentStream): void {
    const usage: AgentTokenUsage = {
      inputTokenCached: message.inputTokenCached,
      inputTokenUncached: message.inputTokenUncached,
      outputToken: message.outputToken,
    };
    const total =
      usage.inputTokenCached + usage.inputTokenUncached + usage.outputToken;
    if (!stream || total <= 0) {
      return;
    }
    // Fire-and-forget: bookkeeping must never break the user's stream.
    void this.agentStreamHooks
      .onCallCompleted(stream, message.id, usage)
      .catch((error) => this.logger.error({ error }));
  }

  agentHandler(
    namespaceId: string,
    conversationId: string,
    userId: string,
    send: (data: string) => Promise<void>,
    chatOnly = false,
    stream?: AgentStream,
  ): (
    data: string,
    context: HandlerContext,
    receivedAt?: number,
  ) => Promise<void> {
    const behavior = behaviorContext.getStore();
    let firstTokenRecorded = false;
    const runningToolRows = new Map<string, string>();
    const interruptedCalls = new Map<string, string>();
    let skippedMessageBoundary = false;
    const handle = async (
      data: string,
      context: HandlerContext,
      receivedAt?: number,
    ): Promise<void> => {
      const chunk: ChatResponse = JSON.parse(data);
      if (chunk.response_type === 'delta') {
        const metadata = chunk.attrs?.context;
        const pendingCall = metadata?.pending_usage_call_id;
        if (
          typeof pendingCall === 'string' &&
          !skippedMessageBoundary &&
          context.messageId &&
          context.message?.role === OpenAIMessageRole.ASSISTANT
        ) {
          interruptedCalls.set(pendingCall, context.messageId);
          return;
        }
        const settledCall = metadata?.settled_usage_call_id;
        if (typeof settledCall === 'string') {
          const id = interruptedCalls.get(settledCall);
          if (id && chunk.attrs?.usage) {
            const row = await this.messagesService.settleInterruptedUsage(
              id,
              chunk.attrs.usage,
            );
            interruptedCalls.delete(settledCall);
            if (row) {
              this.reportCallCompleted(
                row,
                context.stopped && stream
                  ? { ...stream, settledAfterStop: true }
                  : stream,
              );
            }
          }
          return;
        }
      }
      if (context.stopped) {
        skippedMessageBoundary ||= ['bos', 'eos'].includes(chunk.response_type);
        return;
      }
      if (behavior) context.behavior = behavior;
      if (
        chunk.response_type === 'bos' ||
        chunk.response_type === 'delta' ||
        chunk.response_type === 'query_attrs'
      ) {
        delete chunk.attrs?.answer_timing;
      }
      if (
        chunk.response_type === 'delta' &&
        chunk.message.content &&
        !chunk.message.tool_call_id &&
        context.message?.role === OpenAIMessageRole.ASSISTANT &&
        context.roundFirstContentAt === undefined
      ) {
        context.roundFirstContentAt = receivedAt ?? Date.now();
      }
      if (context.queryId) {
        const turn = await this.messagesService.findOne(context.queryId);
        if (
          context.runId &&
          turn.attrs?.stopped_runs?.includes(context.runId)
        ) {
          context.failed = true;
          return;
        }
      }

      if (chunk.response_type === 'delta' && chunk.message.tool_call_id) {
        const call = String(chunk.message.tool_call_id);
        if (chunk.attrs?.tool_call?.status === 'running' && context.messageId) {
          runningToolRows.set(call, context.messageId);
        } else if (runningToolRows.has(call)) {
          const id = runningToolRows.get(call)!;
          runningToolRows.delete(call);
          if (id !== context.messageId) {
            await this.messagesService.updateDelta(id, chunk);
            chunk.id = id;
            delete chunk.attrs?.context;
            await send(JSON.stringify(this.forVisitor(chunk, chatOnly)));
            return;
          }
        }
      }
      if (chunk.response_type === 'query_attrs') {
        if (!context.queryId) throw new Error('Missing persisted query');
        const query = await this.messagesService.findOne(context.queryId);
        await this.messagesService.update(
          context.queryId,
          namespaceId,
          conversationId,
          {
            attrs: { ...query.attrs, ...chunk.attrs },
          },
        );
        return;
      }
      if (chunk.response_type === 'bos') {
        let fingerprint: string | undefined;
        let rowSteeredBehavior: BehaviorContext | undefined;
        if (context.canSteer && !context.failed) {
          chunk.attrs = { ...chunk.attrs, can_steer: true };
          const composer = chunk.attrs.composer;
          const requestId = composer?.client_request_id;
          if (chunk.role === OpenAIMessageRole.USER && isUUID(requestId)) {
            chunk.attrs.client_request_id = requestId;
            const { submission_fingerprint: digest, ...display } = composer!;
            chunk.attrs.composer = display;
            if (typeof digest === 'string') {
              fingerprint = digest;
            }
            // Attribution is independent of the fingerprint lookup: every
            // steered send carries its own behavior action in the inbox.
            const token =
              stream && this.streamSessions.get(stream.streamId)?.steerToken;
            if (token && this.redisClient) {
              try {
                const signal = AbortSignal.timeout(1000);
                const timeout = new Promise<null>((resolve) =>
                  signal.addEventListener('abort', () => resolve(null), {
                    once: true,
                  }),
                );
                const row = (await Promise.race([
                  timeout,
                  this.redisClient.eval(
                    commandOptions({ signal }),
                    READ_STEER_INPUT,
                    {
                      keys: ['wizard:steer:' + token],
                      arguments: [requestId],
                    },
                  ),
                ])) as string | [string, string] | null;
                if (row) {
                  const item = decodeSteerItem(row);
                  if (!fingerprint) fingerprint = item.submission_fingerprint;
                  if (item.behavior) rowSteeredBehavior = item.behavior;
                }
              } catch {
                // Let the accepted message stream even if this lookup fails.
              }
            }
            if (rowSteeredBehavior) {
              // A newer steer interrupts the open turn even when it has not
              // produced content yet. Close and settle it first so its empty
              // assistant row keeps its own action/timing and the new steer
              // owns the next assistant turn.
              await this.closeOpenSteeredTurn(context, userId);
              this.captureInitialTurnRow(context);
              // Keep one entry per steered send in arrival order. A batch of
              // direct steers can deliver several user frames before the
              // assistant rows; the first open turn consumes the first one.
              context.steeredQueue = [
                ...(context.steeredQueue ?? []),
                rowSteeredBehavior,
              ];
              if (!context.pendingSteered) context.pendingSteered = new Map();
              context.pendingSteered.set(rowSteeredBehavior.action_id, {
                behavior: rowSteeredBehavior,
              });
            }
          }
        }
        context.lastEos = undefined;
        context.roundFirstContentAt = undefined;
        if (context.answerTiming)
          chunk.attrs = {
            ...chunk.attrs,
            answer_timing: context.answerTiming.value,
          };
        if (chunk.role === OpenAIMessageRole.ASSISTANT) {
          context.toolCalls = undefined;
          context.answeredToolCallIds = new Set();
        }
        const rowSteeredTurn =
          chunk.role === OpenAIMessageRole.ASSISTANT
            ? (context.assistantSteeredBehavior ?? context.steeredQueue?.[0])
            : undefined;
        if (rowSteeredTurn) context.assistantSteeredBehavior = rowSteeredTurn;
        const rowBehavior =
          chunk.role === OpenAIMessageRole.USER
            ? rowSteeredBehavior
            : chunk.role === OpenAIMessageRole.ASSISTANT && rowSteeredTurn
              ? rowSteeredTurn
              : behavior;
        const message: Message = await this.messagesService.create(
          namespaceId,
          conversationId,
          userId || null,
          {
            message: {
              role: chunk.role,
            },
            parentId: context.parentId,
            attrs: {
              ...chunk.attrs,
              ...(fingerprint ? { submission_fingerprint: fingerprint } : {}),
              ...(rowBehavior
                ? { behavior_action_id: rowBehavior.action_id }
                : {}),
              ...(context.queryId
                ? { turn_id: context.queryId, turn_run_id: context.runId }
                : {}),
            },
          },
          false,
        );
        if (
          chunk.role === OpenAIMessageRole.ASSISTANT &&
          context.assistantSteeredBehavior
        ) {
          const pending = context.pendingSteered?.get(
            context.assistantSteeredBehavior.action_id,
          );
          if (pending) pending.lastAssistantRowId = message.id;
        }
        if (context.runId)
          chunk.attrs = {
            ...chunk.attrs,
            ...(context.queryId ? { turn_id: context.queryId } : {}),
            turn_run_id: context.runId,
          };
        chunk.id = message.id;
        chunk.created_at = message.createdAt.toISOString();
        chunk.parentId = message.parentId || undefined;
        chunk.userId = userId || undefined;
        chunk.namespaceId = namespaceId;

        context.messageId = message.id;
        context.message = message.message;
      } else if (chunk.response_type === 'delta') {
        if (chunk.attrs?.tool_call?.interrupts?.length)
          context.interrupted = true;
        if (!context.messageId) {
          const message = this.i18n.t('system.errors.messageIdNotSet');
          throw new AppException(
            message,
            'MESSAGE_ID_NOT_SET',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        if (
          !firstTokenRecorded &&
          context.message?.role === OpenAIMessageRole.ASSISTANT &&
          (chunk.message.content || chunk.message.reasoning_content)
        ) {
          trace.getActiveSpan()?.addEvent('agent.first_token', {
            'agent.token.kind': chunk.message.reasoning_content
              ? 'reasoning'
              : 'content',
          });
          firstTokenRecorded = true;
        }
        const message: Message = await this.messagesService.updateDelta(
          context.messageId,
          chunk,
        );
        if (chunk.message.tool_calls?.length) {
          context.toolCalls = chunk.message.tool_calls;
        }
        if (chunk.message.tool_call_id) {
          context.answeredToolCallIds?.add(String(chunk.message.tool_call_id));
        }

        if (message.status === MessageStatus.STOPPED) {
          context.failed = true;
          return;
        }
        chunk.id = context.messageId;
        delete chunk.attrs?.context;
        context.message = message.message;
      } else if (chunk.response_type === 'eos') {
        const endedAt = new Date();
        const monotonic = performance.now();
        chunk.id = context.messageId;
        const message: Message = await this.messagesService.update(
          context.messageId!,
          namespaceId,
          conversationId,
          {
            status: MessageStatus.SUCCESS,
          },
          false,
        );

        if (message.status === MessageStatus.STOPPED) {
          context.failed = true;
          return;
        }
        const token =
          stream && this.streamSessions.get(stream.streamId)?.steerToken;
        if (
          token &&
          message.message.role === OpenAIMessageRole.USER &&
          message.attrs?.client_request_id
        ) {
          await this.redisClient!.hSet(
            'wizard:steer:' + token,
            'saved:' + message.attrs.client_request_id,
            message.id,
          );
        }
        context.lastEos = {
          message,
          endedAt,
          monotonic,
          firstContentAt: context.roundFirstContentAt,
        };
        this.reportCallCompleted(message, stream);
        // A steered turn ends with its closing/final assistant row. Complete
        // the steered action there instead of waiting for the run's last row,
        // so a later run outcome cannot report it twice.
        const steeredBehavior = context.assistantSteeredBehavior;
        if (
          steeredBehavior &&
          message.message.role === OpenAIMessageRole.ASSISTANT &&
          message.message.content?.trim() &&
          !message.message.tool_calls?.length
        ) {
          await this.settleSteeredTurn(context, steeredBehavior, 'success', {
            userId,
            at: { endedAt, monotonic },
            requireLatestRow: message.id,
            emit: async (saved) => {
              if (!saved.attrs?.answer_timing) return;
              await send(
                JSON.stringify(
                  this.forVisitor(
                    {
                      response_type: 'delta',
                      id: saved.id,
                      message: {},
                      attrs: { answer_timing: saved.attrs.answer_timing },
                    },
                    chatOnly,
                  ),
                ),
              );
            },
          });
        }
        context.message = message.message;
        context.parentId = message.id;
        context.messageId = undefined;
      } else if (chunk.response_type === 'done') {
        const last = context.lastEos;
        if (
          context.answerTiming &&
          !context.timingFinalized &&
          !context.failed &&
          !context.messageId &&
          last &&
          (context.interrupted ||
            (last.message.message.role === OpenAIMessageRole.ASSISTANT &&
              last.message.message.content?.trim() &&
              !last.message.message.tool_calls?.length))
        ) {
          context.timingFinalized = true;
          const timing = finishAnswerTiming(
            context.answerTiming,
            context.interrupted ? 'paused' : 'complete',
            last.endedAt,
            last.monotonic,
          );
          const saved = await this.messagesService.setAnswerTiming(
            last.message.id,
            timing,
          );
          if (saved?.attrs?.answer_timing) {
            await send(
              JSON.stringify(
                this.forVisitor(
                  {
                    response_type: 'delta',
                    id: saved.id,
                    message: {},
                    attrs: { answer_timing: saved.attrs.answer_timing },
                  },
                  chatOnly,
                ),
              ),
            );
            // Allocate DONE after the inserted metadata so Redis IDs stay ordered.
            delete chunk.event_id;
          }
        }
        if (
          !context.failed &&
          !context.interrupted &&
          !context.messageId &&
          context.parentId
        ) {
          await this.messagesService.indexFinalAssistant(
            context.parentId,
            namespaceId,
            conversationId,
            stream
              ? async (tx) => {
                  await this.agentStreamHooks.onStreamCompleted?.(
                    stream,
                    conversationId,
                    context.parentId!,
                    tx,
                  );
                }
              : undefined,
          );
        }
        if (
          behavior &&
          behavior.user_id === userId &&
          !context.failed &&
          !context.interrupted &&
          !context.messageId &&
          last?.message.message.role === OpenAIMessageRole.ASSISTANT &&
          last.message.message.content?.trim() &&
          !last.message.message.tool_calls?.length
        ) {
          await this.behaviorService
            ?.result(behavior, 'success')
            .catch(() => undefined);
        }
        await this.settleSteeredBehaviors(
          context,
          context.failed || context.interrupted ? 'failed' : 'success',
          userId,
        );
        // A clean run (including a decision resume) settles the initiating
        // actions of the interrupted runs it continued. Another pause leaves
        // them for the next decision.
        if (!context.failed && !context.interrupted) {
          await this.finalizeInitialTurnRow(context, 'success');
          await this.completeResumeBehaviors(context, 'success');
        }
        this.reportFirstContentTokenTrace(context, last, userId);
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
        if (behavior)
          void this.behaviorService
            ?.result(behavior, 'failed')
            .catch(() => undefined);
        const failedAt = new Date();
        context.failed = true;
        await this.settleSteeredBehaviors(context, 'failed', userId);
        await this.finalizeInitialTurnRow(context, 'failed');
        await this.completeResumeBehaviors(context, 'failed');
        this.reportChatErrorTrace(chunk, {
          userId,
          namespaceId,
          conversationId,
          requestId: context.runId,
          messageId: context.messageId,
          parentMessageId: context.parentId,
          channel: context.channel,
          platform: context.platform,
          clientVersion: context.clientVersion,
          clientBuild: context.clientBuild,
          shareId: context.shareId ?? stream?.shareId,
          stage: 'stream',
          clientState: 'streaming',
        });
        if (!context.messageId && context.queryId) {
          await handle(
            JSON.stringify({
              response_type: 'bos',
              role: OpenAIMessageRole.ASSISTANT,
            }),
            context,
          );
        }
        if (context.messageId) {
          chunk.id = context.messageId;
          const attrs: MessageAttrs = {
            error_message: chunk.message,
            ...(chunk.code ? { error_code: chunk.code } : {}),
          };
          const message: Partial<OpenAIMessage> = {};
          const syntheticToolCallIds: string[] = [];
          if (context.message?.role === OpenAIMessageRole.TOOL) {
            attrs.tool_call = { status: 'failed', error: chunk.message };
            if (!context.message.tool_call_id && context.toolCalls?.length) {
              const missing = context.toolCalls
                .map((toolCall) => toolCall.id)
                .filter((id): id is string => Boolean(id))
                .filter((id) => !context.answeredToolCallIds?.has(String(id)));
              const [openRowId, ...rest] = missing;
              if (openRowId) {
                message.tool_call_id = openRowId;
                context.message = {
                  ...context.message,
                  tool_call_id: openRowId,
                };
                syntheticToolCallIds.push(...rest);
              }
            }
          }
          await this.messagesService.updateDelta(context.messageId, {
            response_type: 'delta',
            message,
            attrs,
          });

          let parentId = context.messageId;
          for (const toolCallId of syntheticToolCallIds) {
            const created = await this.messagesService.create(
              namespaceId,
              conversationId,
              userId || null,
              {
                message: {
                  role: OpenAIMessageRole.TOOL,
                  tool_call_id: toolCallId,
                },
                parentId,
                status: MessageStatus.FAILED,
                attrs: {
                  tool_call: { status: 'failed', error: chunk.message },
                },
              },
              false,
            );
            parentId = created.id;
          }

          await this.messagesService.update(
            context.messageId,
            namespaceId,
            conversationId,
            {
              status: MessageStatus.FAILED,
            },
            false,
          );
          if (context.answerTiming) {
            const saved = await this.messagesService.setAnswerTiming(
              context.messageId,
              endAnswerTiming(context.answerTiming.value, 'failed', failedAt),
            );
            if (saved?.attrs?.answer_timing) {
              await send(
                JSON.stringify(
                  this.forVisitor(
                    {
                      response_type: 'delta',
                      id: saved.id,
                      message: {},
                      attrs: { answer_timing: saved.attrs.answer_timing },
                    },
                    chatOnly,
                  ),
                ),
              );
              delete chunk.event_id;
            }
          }
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
        await send(JSON.stringify(this.forVisitor(chunk, chatOnly)));
      }
    };
    return handle;
  }

  /**
   * Remember the initial (non-steered) turn's last assistant row when the
   * first steer supersedes it. Its timing is finalized only at the run's
   * terminal outcome, so the run-level action is never completed early.
   */
  private captureInitialTurnRow(context: HandlerContext) {
    if (context.initialTurnCaptured) return;
    context.initialTurnCaptured = true;
    const openRow = context.messageId;
    const lastEos = openRow ? undefined : context.lastEos;
    const rowId = openRow ?? lastEos?.message.id;
    const role = openRow
      ? context.message?.role
      : lastEos?.message.message.role;
    // A tool row or a user row is not the initial answer; never attribute it.
    if (!rowId || role !== OpenAIMessageRole.ASSISTANT) return;
    // The closed row must belong to the run-level action, not a steer.
    if (
      lastEos &&
      context.behavior &&
      lastEos.message.attrs?.behavior_action_id !== context.behavior.action_id
    )
      return;
    context.initialTurnRowId = rowId;
  }

  /** Finalize the captured initial-turn row with the run's terminal outcome. */
  private async finalizeInitialTurnRow(
    context: HandlerContext,
    status: 'success' | 'failed' | 'cancelled',
  ) {
    const rowId = context.initialTurnRowId;
    context.initialTurnRowId = undefined;
    if (!rowId || !context.answerTiming) return;
    const timing =
      status === 'success'
        ? finishAnswerTiming(
            context.answerTiming,
            'complete',
            new Date(),
            performance.now(),
          )
        : endAnswerTiming(
            context.answerTiming.value,
            status === 'cancelled' ? 'stopped' : 'failed',
          );
    await this.messagesService
      .finalizeAnswerTiming(rowId, timing)
      .catch(() => undefined);
  }

  /**
   * Settle the initiating actions of the interrupted runs this decision turn
   * resumes. Runs that pause again leave them for the next decision.
   */
  private async completeResumeBehaviors(
    context: HandlerContext,
    status: 'success' | 'failed' | 'cancelled',
  ) {
    const behaviors = context.resumeBehaviors;
    if (!behaviors?.length) return;
    context.resumeBehaviors = undefined;
    for (const behavior of behaviors) {
      await this.behaviorService
        ?.result(behavior, status)
        .catch(() => undefined);
    }
  }

  /**
   * Settle one steered turn: make its latest assistant row's timing terminal,
   * release the open refs/queue entry, and complete its behavior action once.
   * A transient timing or behavior failure is swallowed so the settle-all
   * loop keeps going; an emit failure still propagates (and skips the
   * behavior result), matching the eos path.
   */
  private async settleSteeredTurn(
    context: HandlerContext,
    turn: BehaviorContext,
    outcome: 'success' | 'failed' | 'cancelled',
    options: {
      userId: string;
      at?: { endedAt: Date; monotonic: number };
      requireLatestRow?: string;
      emit?: (saved: Message) => Promise<void> | void;
    },
  ) {
    const pending = context.pendingSteered?.get(turn.action_id);
    if (
      options.requireLatestRow &&
      pending?.lastAssistantRowId !== options.requireLatestRow
    )
      return;
    if (context.assistantSteeredBehavior?.action_id === turn.action_id)
      context.assistantSteeredBehavior = undefined;
    context.steeredQueue = context.steeredQueue?.filter(
      (behavior) => behavior.action_id !== turn.action_id,
    );
    context.pendingSteered?.delete(turn.action_id);
    if (pending?.lastAssistantRowId && context.answerTiming) {
      const timing =
        outcome === 'success'
          ? finishAnswerTiming(
              context.answerTiming,
              'complete',
              options.at?.endedAt ?? new Date(),
              options.at?.monotonic ?? performance.now(),
            )
          : endAnswerTiming(
              context.answerTiming.value,
              outcome === 'cancelled' ? 'stopped' : 'failed',
            );
      // The steered turn's assistant row was already closed as SUCCESS by its
      // eos; the closed-row finalizer is what persists the failed or stopped
      // outcome used by the answer reconciler.
      const saved = await this.messagesService
        .finalizeAnswerTiming(pending.lastAssistantRowId, timing)
        .catch(() => undefined);
      if (saved && options.emit) await options.emit(saved);
    }
    if (turn.user_id === options.userId)
      await this.behaviorService?.result(turn, outcome).catch(() => undefined);
  }

  /**
   * Close the steered turn that is still open when a newer steer arrives.
   * Its latest assistant row keeps its own action id and receives a terminal
   * timing, and the action completes even if the turn produced no content.
   */
  private async closeOpenSteeredTurn(context: HandlerContext, userId: string) {
    const open = context.assistantSteeredBehavior;
    if (!open) return;
    await this.settleSteeredTurn(context, open, 'success', { userId });
  }

  /**
   * Complete every steered behavior that did not reach its closing assistant
   * row. The row's answer timing is made terminal in the same step so the
   * answer reconciler can match the action.
   */
  private async settleSteeredBehaviors(
    context: HandlerContext,
    status: 'success' | 'failed' | 'cancelled',
    userId: string,
  ) {
    const pending = context.pendingSteered;
    if (!pending?.size) return;
    const turns = [...pending.values()].map((entry) => entry.behavior);
    for (const behavior of turns)
      await this.settleSteeredTurn(context, behavior, status, { userId });
    context.pendingSteered = undefined;
    context.steeredQueue = undefined;
    context.assistantSteeredBehavior = undefined;
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

  private sanitizeErrorMessage(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    return value
      .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
      .replace(
        /\b(token|authorization|cookie|password|secret|api[_-]?key)\b\s*[:=]\s*[^\s,;]+/gi,
        '$1=[redacted]',
      )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 512);
  }

  private isDuplicateChatError(key: string): boolean {
    const now = Date.now();
    for (const [entry, expiresAt] of this.reportedChatErrors) {
      if (expiresAt <= now) this.reportedChatErrors.delete(entry);
    }
    if (this.reportedChatErrors.has(key)) return true;
    this.reportedChatErrors.set(key, now + 5 * 60 * 1000);
    if (this.reportedChatErrors.size > 500) {
      const oldest = this.reportedChatErrors.keys().next().value;
      if (oldest) this.reportedChatErrors.delete(oldest);
    }
    return false;
  }

  private reportChatErrorTrace(error: unknown, context: ChatErrorTraceContext) {
    if (!this.traceService) return;
    const record =
      error !== null && typeof error === 'object'
        ? (error as Record<string, unknown>)
        : {};
    const response =
      record.response !== null && typeof record.response === 'object'
        ? (record.response as Record<string, unknown>)
        : undefined;
    const responseData =
      response?.data !== null && typeof response?.data === 'object'
        ? (response.data as Record<string, unknown>)
        : undefined;
    const appResponse =
      error instanceof AppException
        ? (error.getResponse() as Record<string, unknown>)
        : undefined;
    const statusValue =
      appResponse?.statusCode ??
      response?.status ??
      record.status ??
      record.statusCode ??
      responseData?.statusCode;
    const status = typeof statusValue === 'number' ? statusValue : undefined;
    const codeValue = appResponse?.code ?? responseData?.code ?? record.code;
    const code =
      typeof codeValue === 'string' && codeValue.trim()
        ? codeValue.trim().toLowerCase()
        : undefined;
    if (
      code &&
      [
        'pending_interrupt',
        'decision_not_applied',
        'interrupt_already_decided',
      ].includes(code)
    ) {
      return;
    }
    const message =
      appResponse?.message ??
      responseData?.message ??
      record.message ??
      (error instanceof Error ? error.message : undefined);
    const category = chatErrorCategory(code, status);
    const group = chatErrorGroup(category);
    const stage = context.stage ?? 'stream';
    const userVisible = context.userVisible ?? true;
    const identity =
      context.userId ||
      (context.shareId ? `share:${context.shareId}` : 'anonymous');
    const dedupeKey = [
      identity,
      context.conversationId || 'unknown',
      context.requestId || 'unknown',
      stage,
      code || 'unknown',
      context.clientState || stage,
      userVisible ? 'visible' : 'hidden',
    ].join(':');
    if (this.isDuplicateChatError(dedupeKey)) return;

    void this.traceService
      .emitTraceEvents(
        [
          {
            name: 'chat_error',
            props: {
              schema_version: 1,
              conversation_id: context.conversationId,
              request_id: context.requestId,
              message_id: context.messageId,
              parent_message_id: context.parentMessageId,
              channel: context.channel,
              stage,
              error_category: category,
              error_group: group,
              error_code: code,
              http_status: status,
              error_message: this.sanitizeErrorMessage(message),
              user_visible: userVisible,
              retryable: ['network', 'service', 'quota'].includes(group),
              client_state: context.clientState ?? stage,
              share_id: context.shareId,
              source: 'server',
              dedupe_key: dedupeKey,
            },
          },
        ],
        {
          userId: context.userId,
          platform: context.platform,
          clientVersion: context.clientVersion,
          clientBuild: context.clientBuild,
        },
      )
      .catch((traceError) => this.logger.error({ error: traceError }));
  }

  private reportFirstContentTokenTrace(
    context: HandlerContext,
    last: HandlerContext['lastEos'],
    userId: string,
  ) {
    if (!this.traceService) return;
    if (
      context.firstTokenTraceReported === true ||
      context.failed ||
      context.interrupted ||
      context.messageId ||
      !context.queryId ||
      !context.runId ||
      context.queryReceivedAt === undefined ||
      !last ||
      last.message.message.role !== OpenAIMessageRole.ASSISTANT ||
      !last.message.message.content?.trim() ||
      last.message.message.tool_calls?.length ||
      last.firstContentAt === undefined
    ) {
      return;
    }
    context.firstTokenTraceReported = true;
    const queryReceivedAt = context.queryReceivedAt;
    const firstContentTokenAt = last.firstContentAt;
    void this.traceService
      .emitTraceEvents(
        [
          {
            name: 'chat_first_content_token',
            props: {
              schema_version: 1,
              conversation_id: last.message.conversationId,
              request_id: context.runId,
              query_message_id: context.queryId,
              answer_message_id: last.message.id,
              channel: context.channel,
              mode: context.mode,
              query_received_at: queryReceivedAt,
              first_content_token_at: firstContentTokenAt,
              first_content_token_latency_ms:
                firstContentTokenAt - queryReceivedAt,
              ...(context.shareId ? { share_id: context.shareId } : {}),
              ...(context.answerTiming?.value.answer_id
                ? { answer_id: context.answerTiming.value.answer_id }
                : {}),
              source: 'server',
            },
          },
        ],
        {
          userId,
          platform: context.platform,
          clientVersion: context.clientVersion,
          clientBuild: context.clientBuild,
        },
      )
      .catch((error) => this.logger.error({ error }));
  }

  // An error raised before the agent stream exists (the conversation waits
  // for a decision, is busy, ...) goes to the client as an error chunk it can
  // parse, carrying the exception payload such as message_id and
  // interrupt_count.
  errorChunkStream(
    error: unknown,
    context: ChatErrorTraceContext = {},
  ): Observable<MessageEvent> {
    this.logger.error({ error });
    trace.getActiveSpan()?.recordException(error as Error);
    this.reportChatErrorTrace(error, context);
    let payload: Record<string, unknown>;
    if (error instanceof AppException) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { statusCode, timestamp, ...rest } = error.getResponse();
      payload = rest;
    } else if (error instanceof HttpException) {
      payload = { message: error.message };
    } else {
      payload = { message: this.i18n.t('system.errors.wizardRequestFailed') };
    }
    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({
        data: JSON.stringify({ response_type: 'error', ...payload }),
      });
      subscriber.complete();
    });
  }

  streamError(
    subscriber: Subscriber<MessageEvent>,
    error: Error | AppException,
    context: ChatErrorTraceContext = {},
  ) {
    this.logger.error({ error });
    this.reportChatErrorTrace(error, context);
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
    }
    subscriber.error(error);
  }

  private async expandVisibleResources<
    T extends PrivateSearchToolDto | WebSearchToolDto,
  >(
    namespaceId: string,
    userId: string,
    tools?: T[],
  ): Promise<T[] | undefined> {
    if (!tools?.length) {
      return tools;
    }
    const expanded: T[] = [];
    for (const tool of tools) {
      if (!isPrivateSearchTool(tool)) {
        expanded.push(tool);
        continue;
      }
      expanded.push({
        ...tool,
        visible_resources:
          await this.visibleResourcesService.getVisibleResources(
            namespaceId,
            userId,
            tool.resources || [],
          ),
      });
    }
    return expanded;
  }

  private async getShareVisibleResources(
    share: Share,
    reqResources: PrivateSearchResourceDto[],
  ): Promise<PrivateSearchResourceDto[]> {
    if (reqResources.length === 0) {
      const resources =
        await this.sharedResourcesService.getAllSharedResources(share);
      return resources.map((r) => toPrivateSearchResource(r));
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
          ...subResources.map((r) => toPrivateSearchResource(r)),
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
    chatOnly = false,
    timeZone?: string,
    parentMode: 'latest' | 'explicit' = 'explicit',
    traceContext: ChatClientTraceContext = {},
    queryReceivedAt?: number,
    fingerprint?: string,
  ): Promise<Observable<MessageEvent>> {
    const parentId = await this.resolveStreamParent(
      namespaceId,
      requestDto,
      userId,
      shareId,
      parentMode,
    );
    let messages: Message[] = [];
    if (parentId) {
      const allMessages = await this.messagesService.findAll(
        userId,
        requestDto.conversation_id,
      );
      messages = this.getMessages(allMessages, parentId);
    }

    const key = getStreamKey(
      namespaceId,
      requestDto.conversation_id,
      userId,
      shareId,
    );
    if (this.streamSessions.has(key)) {
      throw new AppException(
        this.i18n.t('system.errors.conversationBusy'),
        'CONVERSATION_BUSY',
        HttpStatus.CONFLICT,
      );
    }

    const session = this.startAgentSession(
      key,
      namespaceId,
      requestDto,
      requestId,
      mode,
      userId,
      shareId,
      parentId,
      messages,
      chatOnly,
      timeZone,
      traceContext,
      queryReceivedAt,
      fingerprint,
    );
    return new Observable<MessageEvent>((subscriber) =>
      this.attachSession(session, subscriber),
    );
  }

  private async resolveStreamParent(
    namespaceId: string,
    requestDto: AgentRequestDto,
    userId: string,
    shareId: string,
    parentMode: 'latest' | 'explicit',
  ): Promise<string | undefined> {
    const release = await this.acquireConversationLock(
      namespaceId,
      requestDto.conversation_id,
      userId,
      shareId,
      {
        // The gate belongs to the owner's user scope; a decision is not a new
        // ask and must start so a pending save's own approval recovery can run.
        ignoreSaveGate:
          Boolean(shareId) || Boolean(requestDto.tool_call?.decisions?.length),
      },
    );
    try {
      let parent =
        parentMode === 'latest'
          ? await this.findLatestParent(userId, requestDto.conversation_id)
          : requestDto.parent_message_id && release
            ? await this.messagesService.findOneInConversation(
                requestDto.parent_message_id,
                requestDto.conversation_id,
                userId,
              )
            : null;
      if (!release && parentMode === 'explicit') {
        await this.claimStreamActive(
          namespaceId,
          requestDto.conversation_id,
          userId,
          shareId,
        );
        return requestDto.parent_message_id;
      }
      if (
        parentMode === 'explicit' &&
        requestDto.parent_message_id &&
        !parent
      ) {
        throw new AppException(
          this.i18n.t('system.errors.parentConversationMismatch'),
          'PARENT_CONVERSATION_MISMATCH',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (
        parent &&
        requestDto.follow_latest &&
        !requestDto.tool_call?.decisions?.length
      ) {
        parent = await this.followLatest(parent, requestDto, userId);
      }
      this.assertNoPendingInterrupt(
        parent,
        Boolean(requestDto.tool_call?.decisions?.length),
      );
      await this.assertInterruptOpen(
        parent,
        requestDto.conversation_id,
        Boolean(requestDto.tool_call?.decisions?.length),
      );
      if (requestDto.tool_call?.decisions?.length) {
        await this.assertDecisionUnapplied(parent, requestDto.conversation_id);
      } else {
        await this.assertDecisionApplied(
          parent,
          requestDto.conversation_id,
          userId,
        );
      }
      await this.claimStreamActive(
        namespaceId,
        requestDto.conversation_id,
        userId,
        shareId,
      );
      return parent?.id;
    } finally {
      await release?.();
    }
  }

  // A message waiting for tool decisions only accepts those decisions. The
  // error names the message and how many decisions it needs, so a client
  // that did not know about it (an approval raised in another client) can
  // decide it and retry.
  assertNoPendingInterrupt(
    parent: Message | null | undefined,
    hasDecisions: boolean,
  ) {
    const interrupts: unknown[] | undefined =
      parent?.message.role === OpenAIMessageRole.ASSISTANT
        ? parent.attrs?.tool_call?.interrupts
        : undefined;
    if (parent && interrupts?.length && !hasDecisions) {
      throw new AppException(
        this.i18n.t('system.errors.pendingInterrupt'),
        'PENDING_INTERRUPT',
        HttpStatus.CONFLICT,
        { message_id: parent.id, interrupt_count: interrupts.length },
      );
    }
  }

  // The newest message, read under the conversation lock. A user message
  // there is a question whose reply never came; startAgentSession would take
  // a new question under it as a retry of it and drop the new text, so the
  // message above it is returned, as followLatest does. An accepted decision
  // is returned so that the question is refused until it is applied.
  private async findLatestParent(
    userId: string,
    conversationId: string,
  ): Promise<Message | null> {
    const latest = await this.messagesService.findLatest(
      userId,
      conversationId,
    );
    if (
      latest?.message.role !== OpenAIMessageRole.USER ||
      latest.attrs?.tool_call?.decisions?.length
    )
      return latest;
    if (!latest.parentId) return null;
    return await this.messagesService.findOneInConversation(
      latest.parentId,
      conversationId,
      userId,
    );
  }

  // Runs under the conversation lock, after any running reply finished, so
  // the newest message is final. A user message there is a question whose
  // reply never came; a new question under it would be taken as a retry of
  // it, so the given parent is kept then.
  private async followLatest(
    parent: Message,
    requestDto: AgentRequestDto,
    userId: string,
  ): Promise<Message> {
    const leaf = await this.messagesService.findLeafBelow(
      parent.id,
      requestDto.conversation_id,
      userId,
    );
    if (!leaf) return parent;
    // An accepted decision without results is returned so that the question
    // is refused until the decision is applied (assertDecisionApplied).
    if (
      leaf.message.role === OpenAIMessageRole.USER &&
      !leaf.attrs?.tool_call?.decisions?.length
    )
      return parent;
    return leaf;
  }

  // An accepted decision message D whose resume produced nothing usable: no
  // child at all, or only failed empty replies (the resume errored before any
  // tool result). Sending the decision again under D resumes it once more.
  private isUnappliedDecision(
    decision: Message | null | undefined,
    children: Message[],
  ): boolean {
    return Boolean(
      decision?.message.role === OpenAIMessageRole.USER &&
      decision.attrs?.tool_call?.decisions?.length &&
      children.every((child) => this.isFailedEmptyReply(child)),
    );
  }

  private isFailedEmptyReply(message: Message): boolean {
    const content = message.message.content;
    return (
      message.message.role === OpenAIMessageRole.ASSISTANT &&
      ![
        MessageStatus.SUCCESS,
        MessageStatus.STREAMING,
        MessageStatus.PENDING,
      ].includes(message.status) &&
      !(typeof content === 'string' ? content.trim() : content) &&
      !message.message.tool_calls?.length &&
      !message.attrs?.tool_call?.interrupts?.length
    );
  }

  // Decisions sent again under a decision message D may only re-resume a D
  // whose resume failed. Once D has a tool result or a reply (another client
  // resumed it, possibly while this request waited for the lock), resuming
  // it again would run an approved tool twice.
  private async assertDecisionUnapplied(
    parent: Message | null | undefined,
    conversationId: string,
  ) {
    if (
      !parent ||
      parent.message.role !== OpenAIMessageRole.USER ||
      !parent.attrs?.tool_call?.decisions?.length
    )
      return;
    const children = await this.messagesService.findChildren(
      parent.id,
      conversationId,
    );
    if (this.isUnappliedDecision(parent, children)) return;
    throw new AppException(
      this.i18n.t('system.errors.interruptAlreadyDecided'),
      'INTERRUPT_ALREADY_DECIDED',
      HttpStatus.CONFLICT,
      { message_id: parent.id },
    );
  }

  // A new question may not continue from a decision that was accepted but
  // never applied: the rejected or approved calls would stay without a tool
  // result. The client applies the decision again under D, then retries.
  // Also used before appending saved resource messages (backend-pro).
  async assertDecisionApplied(
    parent: Message | null | undefined,
    conversationId: string,
    userId: string,
  ) {
    if (!parent) return;
    let decision: Message | null | undefined;
    if (parent.message.role === OpenAIMessageRole.USER) {
      decision = parent;
    } else if (this.isFailedEmptyReply(parent) && parent.parentId) {
      decision = await this.messagesService.findOneInConversation(
        parent.parentId,
        conversationId,
        userId,
      );
    }
    if (!decision?.attrs?.tool_call?.decisions?.length) return;
    const children = await this.messagesService.findChildren(
      decision.id,
      conversationId,
    );
    if (!this.isUnappliedDecision(decision, children)) return;
    throw new AppException(
      this.i18n.t('system.errors.decisionNotApplied'),
      'DECISION_NOT_APPLIED',
      HttpStatus.CONFLICT,
      {
        message_id: decision.id,
        interrupt_count: decision.attrs.tool_call.decisions.length,
      },
    );
  }

  // Decisions resume the interrupted run once. A message that already has a
  // reply was decided elsewhere (e.g. in the web while the bot still thought
  // it was pending); deciding it again would fork a second resume.
  private async assertInterruptOpen(
    parent: Message | null | undefined,
    conversationId: string,
    hasDecisions: boolean,
  ) {
    if (
      !hasDecisions ||
      !parent?.attrs?.tool_call?.interrupts?.length ||
      !(await this.messagesService.hasChildren(parent.id, conversationId))
    )
      return;
    throw new AppException(
      this.i18n.t('system.errors.interruptAlreadyDecided'),
      'INTERRUPT_ALREADY_DECIDED',
      HttpStatus.CONFLICT,
      { message_id: parent.id },
    );
  }

  async acquireConversationLock(
    namespaceId: string,
    conversationId: string,
    userId: string,
    shareId: string,
    options: { ignoreSaveGate?: boolean; ignoreActiveStream?: boolean } = {},
    deadline: number = Date.now() + 290_000,
  ): Promise<(() => Promise<void>) | null> {
    const client = await this.getRedisClient();
    if (!client) {
      return null;
    }
    const streamKey = getStreamKey(
      namespaceId,
      conversationId,
      userId,
      shareId,
    );
    const activeKey = this.streamActiveKey(streamKey);
    const waiting = async () =>
      (!options.ignoreActiveStream && (await client.exists(activeKey))) ||
      (!options.ignoreSaveGate &&
        (await this.savePendingFor(
          client,
          namespaceId,
          conversationId,
          userId,
        )));
    while (await waiting()) {
      if (Date.now() > deadline) {
        throw new AppException(
          this.i18n.t('system.errors.conversationBusy'),
          'CONVERSATION_BUSY',
          HttpStatus.CONFLICT,
        );
      }
      await this.sleep(250);
    }
    const lockKey = this.conversationLockKey(namespaceId, conversationId);
    const token = randomUUID();
    while (!(await client.set(lockKey, token, { NX: true, EX: 30 }))) {
      if (Date.now() > deadline) {
        throw new AppException(
          this.i18n.t('system.errors.conversationBusy'),
          'CONVERSATION_BUSY',
          HttpStatus.CONFLICT,
        );
      }
      await this.sleep(250);
    }
    if (!options.ignoreActiveStream && (await client.exists(activeKey))) {
      await client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        { keys: [lockKey], arguments: [token] },
      );
      // Share the original deadline so one admission attempt stays bounded.
      return this.acquireConversationLock(
        namespaceId,
        conversationId,
        userId,
        shareId,
        options,
        deadline,
      );
    }
    return async () => {
      await client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        { keys: [lockKey], arguments: [token] },
      );
    };
  }

  async beginPendingSave(
    namespaceId: string,
    conversationId: string,
    userId: string,
    token: string,
    ttlMs: number,
  ): Promise<void> {
    const client = await this.getRedisClient();
    if (!client) return;
    const now = Date.now();
    await client.eval(BEGIN_PENDING_SAVE, {
      keys: [saveGateKey(getStreamKey(namespaceId, conversationId, userId))],
      arguments: [
        token,
        String(now),
        String(now + ttlMs),
        String(SAVE_GATE_SAFETY_TTL_SECONDS),
      ],
    });
  }

  async endPendingSave(
    namespaceId: string,
    conversationId: string,
    userId: string,
    token: string,
  ): Promise<void> {
    const client = await this.getRedisClient();
    if (!client) return;
    await client.eval(END_PENDING_SAVE, {
      keys: [saveGateKey(getStreamKey(namespaceId, conversationId, userId))],
      arguments: [token],
    });
  }

  async isSavePending(
    namespaceId: string,
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const client = await this.getRedisClient();
    if (!client) return false;
    return this.savePendingFor(client, namespaceId, conversationId, userId);
  }

  private async savePendingFor(
    client: RedisClient,
    namespaceId: string,
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const pending = await client.eval(IS_SAVE_PENDING, {
      keys: [saveGateKey(getStreamKey(namespaceId, conversationId, userId))],
      arguments: [String(Date.now())],
    });
    return Number(pending) === 1;
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
    chatOnly = false,
    timeZone?: string,
    traceContext: ChatClientTraceContext = {},
    queryReceivedAt?: number,
    fingerprint?: string,
  ): StreamSession {
    requestId = requestId?.trim() || randomUUID();
    const session: StreamSession = {
      key,
      namespaceId,
      conversationId: requestDto.conversation_id,
      userId,
      shareId,
      channel: requestDto.channel,
      platform: traceContext.platform,
      clientVersion: traceContext.clientVersion,
      clientBuild: traceContext.clientBuild,
      subscribers: new Set(),
      events: [],
      controller: new AbortController(),
      handlerContext: {
        parentId,
        channel: requestDto.channel,
        platform: traceContext.platform,
        clientVersion: traceContext.clientVersion,
        clientBuild: traceContext.clientBuild,
        shareId,
        queryReceivedAt,
        mode,
      },
      finished: false,
    };
    this.streamSessions.set(key, session);

    const agentStream = agentStreamOf(session);
    const handler = this.agentHandler(
      namespaceId,
      requestDto.conversation_id,
      userId,
      (data) => this.sendSessionData(session, data),
      chatOnly,
      agentStream,
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
      current_resource_id: requestDto.current_resource_id,
      messages,
      tools,
      enable_thinking: requestDto.enable_thinking,
      edition: requestDto.edition,
      level: requestDto.level,
      lang: requestDto.lang,
      tool_call: requestDto.tool_call,
      channel: requestDto.channel,
      images: requestDto.images,
      share_id: shareId,
      share_access_token: shareId
        ? this.shareAccessTokenService.mint(shareId)
        : undefined,
    };

    void (async () => {
      await this.startRedisSession(session);
      if (
        requestDto.client_request_id !== undefined &&
        !isUUID(requestDto.client_request_id)
      ) {
        throw new AppException(
          this.i18n.t('system.errors.wizardRequestFailed'),
          'INVALID_CLIENT_REQUEST_ID',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (
        typeof requestDto.query !== 'string' ||
        (!requestDto.query.trim() &&
          !requestDto.tool_call?.decisions?.length &&
          !requestDto.images?.length)
      ) {
        throw new AppException(
          this.i18n.t('system.errors.wizardRequestFailed'),
          'INVALID_QUERY',
          HttpStatus.BAD_REQUEST,
        );
      }
      let query: (Message & { reused?: boolean }) | undefined = messages.at(-1);
      if (query?.message.role !== OpenAIMessageRole.USER) {
        const attrs: Record<string, unknown> = { ...wizardRequest };
        delete attrs.messages;
        // A live credential: never persisted or echoed back to clients.
        delete attrs.share_access_token;
        query = await this.messagesService.create(
          namespaceId,
          requestDto.conversation_id,
          userId || null,
          {
            message: {
              role: OpenAIMessageRole.USER,
              content: requestDto.query,
            },
            parentId,
            status: MessageStatus.SUCCESS,
            attrs: {
              ...attrs,
              ...(fingerprint ? { submission_fingerprint: fingerprint } : {}),
              user_context: {
                lang: requestDto.lang || '简体中文',
                ...(requestDto.source_channel
                  ? { channel: requestDto.source_channel }
                  : {}),
              },
              ...(requestDto.images?.length
                ? {
                    composer: {
                      display_parts: [
                        { type: 'text', text: requestDto.query },
                        ...requestDto.images.map((image) => ({
                          type: 'image',
                          attachment_id: image.attachment_id,
                          name: image.name,
                          preview_url: `/api/v1/namespaces/${namespaceId}/conversations/${requestDto.conversation_id}/attachments/${image.attachment_id}`,
                        })),
                      ],
                    },
                  }
                : {}),
            },
          },
          true,
          { timeZone, clientRequestId: requestDto.client_request_id },
        );
        messages.push(query);
        await this.sendSavedMessage(session, query, chatOnly);
        if (query.reused) {
          const all = await this.messagesService.findAll(
            userId,
            requestDto.conversation_id,
          );
          let next = all.findLast((message) => message.parentId === query!.id);
          if (next) {
            while (next) {
              await this.sendSavedMessage(session, next, chatOnly);
              const id = next.id;
              next = all.findLast((message) => message.parentId === id);
            }
            await this.sendSessionData(
              session,
              JSON.stringify({ response_type: 'done' }),
            );
            return;
          }
        }
      }
      const resumeBehaviors = requestDto.tool_call?.decisions?.length
        ? collectPausedResumeBehaviors(
            messages,
            userId,
            behaviorContext.getStore()?.action_id,
          )
        : [];
      session.handlerContext = {
        parentId: query.id,
        queryId: query.id,
        runId: requestId,
        channel: session.channel,
        platform: session.platform,
        clientVersion: session.clientVersion,
        clientBuild: session.clientBuild,
        shareId: session.shareId,
        queryReceivedAt,
        mode,
        ...(resumeBehaviors.length ? { resumeBehaviors } : {}),
      };
      wizardRequest.query_persisted = true;
      wizardRequest.messages = messages.map((message) => {
        if (
          message.message.role !== OpenAIMessageRole.USER ||
          message.attrs?.tool_call?.decisions?.length ||
          message.attrs?.user_context?.created_at ||
          !message.createdAt
        )
          return message;
        return {
          ...message,
          attrs: {
            ...message.attrs,
            user_context: {
              ...message.attrs?.user_context,
              created_at: message.createdAt.toISOString(),
            },
          },
        };
      });
      if (session.finished || session.controller.signal.aborted) return;
      session.handlerContext.answerTiming = startAnswerTiming(
        requestId,
        messages,
        Boolean(
          requestDto.tool_call?.decisions?.length ||
          query.attrs?.tool_call?.decisions?.length,
        ),
      );
      await this.stream(
        namespaceId,
        mode,
        wizardRequest,
        requestId,
        async (data) => {
          const chunkReceivedAt = Date.now();
          if (session.controller.signal.aborted) return;
          if (
            !session.finished &&
            !session.handlerContext.stopped &&
            (await this.isSessionCanceled(session.key))
          ) {
            await this.stopSession(session);
          }
          if (session.handlerContext.stopped) {
            // The browser stream has stopped. The Wizard can still settle a
            // model call interrupted by Steer on this upstream connection.
            if (session.drainUsage) await handler(data, session.handlerContext);
            return;
          }
          if (session.finished) return;
          const chunk = JSON.parse(data) as ChatResponse & {
            event_id?: string;
          };
          delete chunk.event_id;
          const payload = JSON.stringify(chunk);
          // Allocate terminal cursors after synthetic metadata and error messages.
          await handler(
            ['bos', 'delta'].includes(chunk.response_type)
              ? await this.addNextEventId(session, payload)
              : payload,
            session.handlerContext,
            chunkReceivedAt,
          );
        },
        session.controller.signal,
        agentStream,
      );
    })()
      .then(() => {
        if (!session.handlerContext.stopped) this.completeSession(session);
      })
      .catch(async (err: Error) => {
        if (
          !session.controller.signal.aborted &&
          !session.handlerContext.stopped
        ) {
          await this.errorSession(session, err);
        }
      });

    return session;
  }

  private async sendSavedMessage(
    session: StreamSession,
    message: Message,
    chatOnly: boolean,
  ) {
    if (message.message.role === OpenAIMessageRole.SYSTEM) return;
    // Replayed chunks carry attrs from the stored row; the per-call context is
    // server-side observability only and must not reach clients. Copy first so
    // the persisted attrs stay untouched.
    const attrs = message.attrs ? { ...message.attrs } : undefined;
    if (attrs) delete attrs.context;
    for (const chunk of [
      {
        response_type: 'bos',
        role: message.message.role,
        id: message.id,
        created_at: message.createdAt.toISOString(),
        parentId: message.parentId || undefined,
        userId: session.userId || undefined,
        namespaceId: session.namespaceId,
        attrs,
      },
      {
        response_type: 'delta',
        id: message.id,
        message: message.message,
        attrs,
      },
      { response_type: 'eos', id: message.id, role: message.message.role },
    ] as ChatResponse[]) {
      await this.sendSessionData(
        session,
        JSON.stringify(this.forVisitor(chunk, chatOnly)),
      );
    }
    if (message.status === MessageStatus.FAILED) {
      await this.sendSessionData(
        session,
        JSON.stringify({
          response_type: 'error',
          id: message.id,
          ...(message.attrs?.error_code
            ? { code: message.attrs.error_code }
            : {}),
          message: message.attrs?.error_message || 'Response failed',
        }),
      );
    }
  }

  private attachSession(
    session: StreamSession,
    subscriber: Subscriber<MessageEvent>,
  ) {
    for (const data of session.events || []) subscriber.next({ data });
    if (session.finished) {
      subscriber.complete();
      return;
    }
    session.subscribers.add(subscriber);
    return () => {
      session.subscribers.delete(subscriber);
    };
  }

  private async claimStreamActive(
    namespaceId: string,
    conversationId: string,
    userId: string,
    shareId: string,
  ) {
    const client = await this.getRedisClient();
    if (!client) return;
    const key = getStreamKey(namespaceId, conversationId, userId, shareId);
    await client.del([
      this.streamEventsKey(key),
      this.streamSequenceKey(key),
      this.streamCancelKey(key),
    ]);
    await client.set(this.streamActiveKey(key), '1', {
      EX: STREAM_TTL_SECONDS,
    });
  }

  private async startRedisSession(session: StreamSession) {
    try {
      const client = await this.getRedisClient();
      if (client) {
        const claimed = await client.set(
          this.streamActiveKey(session.key),
          '1',
          { NX: true, EX: STREAM_TTL_SECONDS },
        );
        if (claimed) {
          await client.del([
            this.streamEventsKey(session.key),
            this.streamSequenceKey(session.key),
            this.streamCancelKey(session.key),
          ]);
        }
      }

      const subscriber = await this.getRedisSubscriber();
      if (!subscriber) return;
      await subscriber.subscribe(this.streamControlChannel(session.key), () => {
        void this.stopSessionAfterAdmission(session).catch((error) =>
          this.logger.error({ error }),
        );
      });
    } catch (error) {
      this.logger.error({ error });
    }
  }

  private async isSessionCanceled(key: string): Promise<boolean> {
    try {
      const client = await this.getRedisClient();
      return client
        ? Boolean(await client.exists(this.streamCancelKey(key)))
        : false;
    } catch (error) {
      this.logger.error({ error });
      return false;
    }
  }

  private addEventId(data: string, eventId: string): string {
    const chunk = JSON.parse(data);
    if (['bos', 'delta'].includes(chunk.response_type)) {
      chunk.attrs = { ...chunk.attrs, stream_event_id: eventId };
    }
    return JSON.stringify({ ...chunk, event_id: eventId });
  }

  private async addNextEventId(
    session: StreamSession,
    data: string,
  ): Promise<string> {
    try {
      const client = await this.getRedisClient();
      if (!client) return data;
      const sequenceKey = this.streamSequenceKey(session.key);
      const sequence = await client.incr(sequenceKey);
      await client.expire(sequenceKey, STREAM_TTL_SECONDS);
      return this.addEventId(data, `1-${sequence}`);
    } catch (error) {
      this.logger.error({ error });
      return data;
    }
  }

  private async sendSessionData(session: StreamSession, data: string) {
    if (session.finished) return;
    const payload = data.includes('"event_id"')
      ? data
      : await this.addNextEventId(session, data);
    try {
      const client = await this.getRedisClient();
      if (client) {
        const eventId = JSON.parse(payload).event_id;
        if (eventId) {
          await client.sendCommand([
            'XADD',
            this.streamEventsKey(session.key),
            'MAXLEN',
            '~',
            String(STREAM_MAXLEN),
            eventId,
            'data',
            payload,
          ]);
          await Promise.all([
            client.expire(
              this.streamEventsKey(session.key),
              STREAM_TTL_SECONDS,
            ),
            client.expire(
              this.streamActiveKey(session.key),
              STREAM_TTL_SECONDS,
            ),
          ]);
        }
      }
    } catch (error) {
      this.logger.error({ error });
    }
    session.events ??= [];
    session.events.push(payload);
    if (session.events.length > STREAM_MAXLEN) session.events.shift();
    for (const subscriber of session.subscribers) {
      if (!subscriber.closed) {
        subscriber.next({ data: payload });
      }
    }
  }

  private completeSession(session: StreamSession) {
    if (session.finished) return;
    session.finished = true;
    if (session.steerToken && this.redisClient?.isOpen) {
      void this.redisClient
        .hDel('wizard:steer:' + session.steerToken, ['open', 'running'])
        .catch((error) => this.logger.error(error));
    }
    for (const subscriber of session.subscribers) {
      if (!subscriber.closed) {
        subscriber.complete();
      }
    }
    session.subscribers.clear();
    this.streamSessions.delete(session.key);
    void this.cleanupRedisSession(session.key).catch((error) =>
      this.logger.error({ error }),
    );
    // Single funnel: completion, errors, stops and aborts all end here, so
    // whatever the stream was holding is always released.
    void this.agentStreamHooks
      .onStreamClosed(agentStreamOf(session))
      .catch((error) => this.logger.error({ error }));
  }

  private async cleanupRedisSession(key: string) {
    if (this.redisClient?.isOpen) {
      await this.redisClient.del(this.streamActiveKey(key));
    }
    if (this.redisSubscriber?.isOpen) {
      await this.redisSubscriber.unsubscribe(this.streamControlChannel(key));
    }
  }

  private async errorSession(session: StreamSession, error: Error) {
    this.logger.error({ error });
    this.reportChatErrorTrace(error, {
      userId: session.userId,
      namespaceId: session.namespaceId,
      conversationId: session.conversationId,
      requestId: session.handlerContext.runId,
      messageId: session.handlerContext.messageId,
      parentMessageId: session.handlerContext.parentId,
      channel: session.channel,
      platform: session.platform,
      clientVersion: session.clientVersion,
      clientBuild: session.clientBuild,
      shareId: session.shareId,
      stage: 'stream',
      clientState: 'streaming',
    });
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
    }
    // A failed turn can never consume what it started, so release it like a stop.
    await this.requestDeploymentCancellation(session);
    const chunk = this.errorChunk(error);
    try {
      if (session.handlerContext.queryId) {
        const handler = this.agentHandler(
          session.namespaceId,
          session.conversationId,
          session.userId,
          (data) => this.sendSessionData(session, data),
          false,
          agentStreamOf(session),
        );
        if (!session.handlerContext.messageId) {
          await handler(
            JSON.stringify({
              response_type: 'bos',
              role: OpenAIMessageRole.ASSISTANT,
            }),
            session.handlerContext,
          );
        }
        await handler(chunk, session.handlerContext);
      } else {
        await this.sendSessionData(session, chunk);
      }
    } catch (persistenceError) {
      this.logger.error({ error: persistenceError });
      await this.sendSessionData(session, chunk);
    } finally {
      this.completeSession(session);
    }
  }

  private errorChunk(error: Error): string {
    const chunk: ChatErrorResponse = {
      response_type: 'error',
      message: error.message,
      ...(error instanceof AppException ? { code: error.code } : {}),
    };
    if (error instanceof AppException && isAgentPreflight(error)) {
      // The Open API turns a preflight failure back into the HTTP response it
      // returned before the expansion moved inside the turn.
      chunk.status = error.getStatus();
    }
    return JSON.stringify(chunk);
  }

  private async requestDeploymentCancellation(session: StreamSession) {
    if (!session.userId) return;
    try {
      await this.agentStreamHooks.onCancellationRequested?.(
        session.userId,
        session.conversationId,
      );
    } catch (error) {
      this.logger.error({ error });
    }
  }

  /** A row that closes a turn with a deliverable answer. */
  private isClosedTerminalAnswerRow(row: Message): boolean {
    return Boolean(
      row.status === MessageStatus.SUCCESS &&
      row.message.role === OpenAIMessageRole.ASSISTANT &&
      row.message.content?.trim() &&
      !row.message.tool_calls?.length,
    );
  }

  /**
   * Whether the run's requested turn already produced its final answer (eos
   * processed with content and no tool calls, no row open) and no queued steer
   * can open another turn. Such a run is only waiting for done and session
   * bookkeeping; stopping it would discard the completed answer.
   */
  private hasClosedTerminalAnswer(context: HandlerContext): boolean {
    if (context.messageId || context.failed || context.interrupted)
      return false;
    if (context.steeredQueue?.length || context.pendingSteered?.size)
      return false;
    const last = context.lastEos?.message;
    return Boolean(last && this.isClosedTerminalAnswerRow(last));
  }

  /**
   * Persisted-state equivalent of the completed-answer no-op for a stop that
   * reaches a replica without the owning session. The latest row must be the
   * active run's closed answer with its done still pending, and every visible
   * steer item must already be persisted; the owning replica then only needs
   * its done to finish.
   */
  private async isRemoteRunAlreadyComplete(
    key: string,
    latest: Message | null,
  ): Promise<boolean> {
    if (
      !latest ||
      !this.isClosedTerminalAnswerRow(latest) ||
      latest.attrs?.answer_timing?.status !== 'running'
    )
      return false;
    const runId = latest.attrs?.turn_run_id;
    if (!runId) return false;
    const client = await this.getRedisClient();
    if (!client) return false;
    // A newer run in admission owns the scope; do not mistake the previous
    // turn's answer for this run's completion.
    const activeRunId = await client.get(`wizard:steer-active:${key}`);
    if (activeRunId && activeRunId !== runId) return false;
    const token = await client.get(`wizard:steer-route:${key}:${runId}`);
    if (!token) return true;
    const inbox = 'wizard:steer:' + token;
    for (const item of await client.lRange(inbox + ':messages', 0, -1)) {
      let clientRequestId: unknown;
      try {
        clientRequestId = JSON.parse(item)?.client_request_id;
      } catch {
        return false;
      }
      if (
        typeof clientRequestId !== 'string' ||
        !clientRequestId ||
        !(await client.hGet(inbox, 'saved:' + clientRequestId))
      )
        return false;
    }
    return true;
  }

  private async waitForAdmission(session: StreamSession, maxWaitMs: number) {
    const deadline = Date.now() + maxWaitMs;
    while (
      !session.finished &&
      !session.handlerContext.queryId &&
      Date.now() < deadline
    )
      await this.sleep(50);
  }

  /**
   * A control-channel stop (the save preemption or a Stop relayed from another
   * replica) waits for a just-registered admission to persist its query row,
   * so the stop carries the run identity instead of aborting the run without
   * a stop stamp.
   */
  private async stopSessionAfterAdmission(
    session: StreamSession,
  ): Promise<Message | null> {
    await this.waitForAdmission(session, STOP_ADMISSION_WAIT_MS);
    return this.stopSession(session);
  }

  private async stopSession(session: StreamSession): Promise<Message | null> {
    if (session.finished || session.handlerContext.stopped) return null;
    // The run's final answer already closed (eos processed, no row open, no
    // steer pending); only done/completeSession remain. Stamping the run
    // stopped here would discard a completed answer.
    if (this.hasClosedTerminalAnswer(session.handlerContext)) return null;
    session.handlerContext.stopped = true;
    session.handlerContext.failed = true;
    session.drainUsage = Boolean(session.steerStopSupported);
    let stopped: Message | null = null;
    try {
      await this.requestDeploymentCancellation(session);
      if (
        session.drainUsage &&
        this.redisClient?.isOpen &&
        session.steerToken
      ) {
        const inbox = 'wizard:steer:' + session.steerToken;
        try {
          const channel =
            ((await this.redisClient.hGet(inbox, 'queue')) || inbox) + ':wake';
          await this.redisClient
            .multi()
            .hSet(inbox, 'stopped', '1')
            .hDel(inbox, ['open', 'running'])
            .publish(channel, 'stop')
            .exec();
        } catch (error) {
          this.logger.error({ error });
          session.drainUsage = false;
        }
      } else {
        session.drainUsage = false;
      }
      if (!session.drainUsage) session.controller.abort();
      await this.markSessionCanceled(session.key);
      // Finalize the superseded initial row before stopRunning stamps
      // stopped_runs on the turn (the closed-row finalizer refuses a stopped
      // run).
      await this.finalizeInitialTurnRow(session.handlerContext, 'cancelled');
      const message = await this.messagesService.stopRunning(
        session.namespaceId,
        session.conversationId,
        session.userId,
        session.handlerContext.messageId ?? session.handlerContext.parentId,
        session.handlerContext.runId && session.handlerContext.queryId
          ? {
              id: session.handlerContext.runId,
              queryId: session.handlerContext.queryId,
            }
          : undefined,
      );
      stopped = message;
      if (session.handlerContext.behavior)
        await this.behaviorService
          ?.result(session.handlerContext.behavior, 'cancelled')
          .catch(() => undefined);
      await this.settleSteeredBehaviors(
        session.handlerContext,
        'cancelled',
        session.userId,
      );
      await this.completeResumeBehaviors(session.handlerContext, 'cancelled');
      const stoppedMessageId = session.handlerContext.messageId ?? message?.id;
      if (message?.attrs?.answer_timing) {
        await this.sendSessionData(
          session,
          JSON.stringify({
            response_type: 'delta',
            id: message.id,
            message: {},
            attrs: { answer_timing: message.attrs.answer_timing },
          }),
        );
      }
      await this.sendSessionData(
        session,
        JSON.stringify({
          response_type: 'stopped',
          id: stoppedMessageId,
        }),
      );
    } finally {
      this.completeSession(session);
    }
    return stopped;
  }

  private async markSessionCanceled(key: string) {
    try {
      const client = await this.getRedisClient();
      if (!client) return;
      await client.set(this.streamCancelKey(key), '1', {
        EX: STREAM_TTL_SECONDS,
      });
    } catch (error) {
      this.logger.error({ error });
    }
  }

  async resumeUserAgentStream(
    userId: string,
    namespaceId: string,
    conversationId: string,
    lastEventId?: string,
    requestId?: string,
    channel = 'web',
    traceContext: ChatClientTraceContext = {},
  ): Promise<Observable<MessageEvent>> {
    await this.conversationsService.findOneForUserInNamespace(
      conversationId,
      userId,
      namespaceId,
    );
    return this.resumeAgentStream(
      getStreamKey(namespaceId, conversationId, userId),
      lastEventId,
      {
        userId,
        namespaceId,
        conversationId,
        requestId,
        channel,
        ...traceContext,
        stage: 'resume',
        clientState: 'resuming',
      },
    );
  }

  resumeShareAgentStream(
    share: Share,
    conversationId: string,
    lastEventId?: string,
    requestId?: string,
    channel = 'web_share',
    traceContext: ChatClientTraceContext = {},
  ): Observable<MessageEvent> {
    return this.resumeAgentStream(
      getStreamKey(share.namespaceId, conversationId, '', share.id),
      lastEventId,
      {
        namespaceId: share.namespaceId,
        conversationId,
        requestId,
        channel,
        ...traceContext,
        shareId: share.id,
        stage: 'resume',
        clientState: 'resuming',
      },
    );
  }

  private resumeAgentStream(
    key: string,
    lastEventId?: string,
    context: ChatErrorTraceContext = {},
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      void this.resumeRedisStream(key, lastEventId, subscriber, context);
    });
  }

  private async resumeRedisStream(
    key: string,
    lastEventId: string | undefined,
    subscriber: Subscriber<MessageEvent>,
    context: ChatErrorTraceContext = {},
  ) {
    const client = await this.createRedisConnection();
    if (!client) {
      const session = this.streamSessions.get(key);
      if (session) {
        this.attachSession(session, subscriber);
      } else {
        subscriber.complete();
      }
      return;
    }

    try {
      if (!(await client.exists(this.streamActiveKey(key)))) {
        subscriber.complete();
        return;
      }
      let cursor = lastEventId || STREAM_START_ID;

      while (!subscriber.closed) {
        const result = (await client.sendCommand([
          'XREAD',
          'BLOCK',
          String(STREAM_BLOCK_MS),
          'STREAMS',
          this.streamEventsKey(key),
          cursor,
        ])) as unknown as RedisStreamReadResult;
        if (!result) {
          if (!(await client.exists(this.streamActiveKey(key)))) break;
          continue;
        }
        for (const [, entries] of result) {
          for (const [eventId, fields] of entries) {
            cursor = eventId;
            const data = this.addEventId(fields[1], eventId);
            subscriber.next({ data });
            if (
              ['done', 'error', 'stopped'].includes(
                JSON.parse(data).response_type,
              )
            ) {
              subscriber.complete();
              return;
            }
          }
        }
      }
      subscriber.complete();
    } catch (error) {
      this.streamError(subscriber, error as Error, context);
    } finally {
      if (client.isOpen) {
        try {
          await client.quit();
        } catch (error) {
          this.logger.error({ error });
        }
      }
    }
  }

  private submissions?: ConversationSubmissions;
  private readonly processingSubmissions = new Set<string>();

  private async submissionQueue() {
    if (this.submissions) return this.submissions;
    const redis = await this.getRedisClient();
    if (!redis) return;
    const upstream =
      this.configService.get<string>('OBB_WIZARD_BASE_URL') || '';
    const environment = createHash('sha256')
      .update(upstream)
      .digest('hex')
      .slice(0, 16);
    this.submissions = new ConversationSubmissions(
      redis,
      `wizard:submissions:${this.wizardApiService.submissionPool}:${environment}`,
    );
    return this.submissions;
  }

  async submitConversationMessage(
    namespaceId: string,
    conversationId: string,
    userId: string,
    body: AgentRequestDto & { expected_run_id?: string },
    timeZone?: string,
    requireQueue = false,
    clientPlatform?: string,
  ) {
    await this.conversationsService.findOneForUserInNamespace(
      conversationId,
      userId,
      namespaceId,
    );
    const content = await prepareSteer(
      body,
      namespaceId,
      conversationId,
      userId,
      this.steerAttachments!,
      this.steerResources!,
    );
    const scope = getStreamKey(namespaceId, conversationId, userId);
    const behavior = behaviorContext.getStore();
    const platform =
      clientPlatform && ['web', 'ios', 'android'].includes(clientPlatform)
        ? clientPlatform
        : undefined;
    const job: ConversationSubmission = {
      checkpointDelivery: true,
      namespaceId,
      conversationId,
      userId,
      timeZone,
      ...(behavior ? { behavior } : {}),
      ...(platform ? { platform } : {}),
      body: {
        ...content,
        tools: content.tools,
        conversation_id: conversationId,
        edition: body.edition,
        level: body.level,
        lang: body.lang,
        enable_thinking: body.enable_thinking,
        channel: body.channel,
        parent_message_id: body.parent_message_id,
        expected_run_id: body.expected_run_id,
      },
    };
    const queue = await this.submissionQueue();
    if (!queue && requireQueue)
      throw new HttpException(
        'Message queue unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const fingerprint = submissionFingerprint(job.body);
    const saved = await this.savedSubmission(job, fingerprint, true);
    if (!queue) {
      if (saved === false) throw new ConflictException('Request ID conflict');
      return saved ?? this.deliverConversationMessage(job);
    }
    const key = queue.key(scope);
    const receipt = await queue.add(
      key,
      job,
      JSON.stringify({
        ...content,
        submission_fingerprint: fingerprint,
        ...(behavior ? { behavior } : {}),
      }),
      saved,
    );
    if (receipt.disposition === 'queued')
      void this.processSubmission(queue, key);
    return receipt;
  }

  async submissionStatus(
    namespaceId: string,
    conversationId: string,
    userId: string,
    id?: string,
  ) {
    await this.conversationsService.findOneForUserInNamespace(
      conversationId,
      userId,
      namespaceId,
    );
    const queue = await this.submissionQueue();
    if (!queue) return [];
    const key = queue.key(getStreamKey(namespaceId, conversationId, userId));
    if (!id) return queue.pending(key);
    if (!isUUID(id)) throw new BadRequestException('Invalid request ID');
    const receipt = await queue.receipt(key, id);
    if (!receipt)
      throw new HttpException('Message receipt expired', HttpStatus.NOT_FOUND);
    return receipt;
  }

  @Interval(1500)
  async drainConversationSubmissions() {
    const queue = await this.submissionQueue();
    if (queue)
      for (const key of await queue.due())
        void this.processSubmission(queue, key);
  }

  async isConversationStreaming(
    namespaceId: string,
    conversationId: string,
    userId: string,
  ) {
    const key = getStreamKey(namespaceId, conversationId, userId);
    return (
      this.streamSessions.has(key) ||
      !!(await (await this.getRedisClient())?.exists(this.streamActiveKey(key)))
    );
  }

  private async processSubmission(queue: ConversationSubmissions, key: string) {
    if (this.processingSubmissions.has(key)) return;
    this.processingSubmissions.add(key);
    try {
      await queue.process(key, async (job) => {
        const deliver = () => this.deliverConversationMessage(job);
        try {
          // The deferred delivery runs outside the POST's request chain; the
          // job's behavior context keeps the action and the stream correlated.
          return job.behavior
            ? await behaviorContext.run(job.behavior, deliver)
            : await deliver();
        } catch (error) {
          if (
            error instanceof AppException &&
            ['PENDING_INTERRUPT', 'DECISION_NOT_APPLIED'].includes(error.code)
          ) {
            await this.rejectQueuedApproval(job, error);
            return;
          }
          if (
            error instanceof AppException &&
            error.code === 'CONVERSATION_BUSY'
          )
            return;
          if (!(error instanceof HttpException) || error.getStatus() >= 500)
            throw error;
          if (job.behavior)
            await this.behaviorService
              ?.result(job.behavior, 'failed')
              .catch(() => undefined);
          return {
            disposition: 'failed',
            client_request_id: job.body.client_request_id!,
            error: error.message,
            query: job.body.query,
          };
        }
      });
    } catch (error) {
      this.logger.error({ message: 'Conversation delivery will retry', error });
    } finally {
      this.processingSubmissions.delete(key);
    }
  }

  private async rejectQueuedApproval(
    job: ConversationSubmission,
    error: AppException,
  ) {
    const id = error.data?.message_id;
    const count = error.data?.interrupt_count;
    if (typeof id !== 'string' || !Number.isSafeInteger(count) || count < 1)
      throw error;
    const { namespaceId, conversationId, userId, timeZone } = job;
    const approval = await this.messagesService.findOneInConversation(
      id,
      conversationId,
      userId,
    );
    const decisions = approval?.attrs?.tool_call?.decisions;
    if (
      error.code === 'DECISION_NOT_APPLIED' &&
      (!decisions?.length ||
        decisions.some(
          (decision) =>
            decision.type !== 'reject' || decision.end_turn !== true,
        ))
    )
      return;
    // Resume the interrupted turn with its original model settings.
    const original = approval?.attrs?.turn_id
      ? await this.messagesService.findOneInConversation(
          approval.attrs.turn_id,
          conversationId,
          userId,
        )
      : undefined;
    const settings = (original?.attrs ?? approval?.attrs) as
      | Pick<AgentRequestDto, 'edition' | 'level' | 'enable_thinking'>
      | undefined;
    try {
      const stream = await this.openUserAgentStream(
        userId,
        namespaceId,
        {
          conversation_id: conversationId,
          parent_message_id: id,
          query: '',
          tools: [],
          edition: settings?.edition,
          level: settings?.level,
          enable_thinking: settings?.enable_thinking,
          channel: job.body.channel,
          tool_call: {
            decisions:
              decisions ??
              Array.from({ length: count }, () => ({
                type: 'reject',
                message:
                  'The user sent a new message instead of approving this operation. Do not retry it.',
                end_turn: true,
              })),
          },
        },
        randomUUID(),
        'ask',
        timeZone,
      );
      const terminal = await lastValueFrom(
        stream.pipe(
          map((event) => JSON.parse(event.data as string) as ChatResponse),
          filter(
            (event) =>
              event.response_type === 'done' || event.response_type === 'error',
          ),
        ),
      );
      if (terminal.response_type === 'error') throw new Error(terminal.message);
    } catch (failure) {
      if (
        !(
          failure instanceof AppException &&
          ['INTERRUPT_ALREADY_DECIDED', 'CONVERSATION_BUSY'].includes(
            failure.code,
          )
        )
      )
        throw failure;
    }
  }

  private async savedSubmission(
    { userId, conversationId, body }: ConversationSubmission,
    fingerprint: string,
    requireFingerprint = false,
  ): Promise<SubmissionReceipt | false | undefined> {
    const requestId = body.client_request_id!;
    const existing = await this.messagesService.findSubmitted(
      userId,
      conversationId,
      requestId,
    );
    const stopped = existing?.status === MessageStatus.STOPPED;
    if (!existing || (!stopped && existing.status !== MessageStatus.SUCCESS))
      return;
    const stored = existing.attrs?.submission_fingerprint;
    // An expired legacy receipt cannot prove that the original inputs match.
    if (stored ? stored !== fingerprint : requireFingerprint) return false;
    if (!stored && !stopped && existing.message.content !== body.query)
      return false;
    return {
      id: existing.id,
      run_id: existing.attrs?.turn_run_id ?? requestId,
      client_request_id: requestId,
      ...(stopped
        ? { disposition: 'failed', error: 'Message was stopped' }
        : { disposition: existing.attrs?.turn_run_id ? 'steered' : 'started' }),
    };
  }

  private async deliverConversationMessage(
    job: ConversationSubmission,
  ): Promise<SubmissionReceipt | undefined> {
    const {
      namespaceId,
      conversationId,
      userId,
      body,
      timeZone,
      checkpointDelivery,
    } = job;
    const runId = body.client_request_id!;
    await this.conversationsService.findOneForUserInNamespace(
      conversationId,
      userId,
      namespaceId,
    );
    const fingerprint = submissionFingerprint(body);
    const saved = await this.savedSubmission(job, fingerprint);
    if (saved === false) throw new ConflictException('Request ID conflict');
    if (saved) return saved;
    const redis = await this.getRedisClient();
    const scope = getStreamKey(namespaceId, conversationId, userId);
    // A pending save must be recorded before this ask is delivered; the item
    // stays queued and its receipt is retried instead of waiting in the lock.
    if (
      redis &&
      (await this.savePendingFor(redis, namespaceId, conversationId, userId))
    )
      return;
    const target =
      body.expected_run_id ??
      (await redis?.get('wizard:steer-active:' + scope));
    if (!checkpointDelivery && target) {
      try {
        const receipt = await this.submitSteer(
          namespaceId,
          conversationId,
          userId,
          target,
          body,
          fingerprint,
          job.behavior,
        );
        return { ...receipt, client_request_id: runId, disposition: 'steered' };
      } catch (error) {
        // Only a definitive refusal before enqueue may be retried as a new turn.
        if (!(error instanceof AppException && error.code === 'STEER_CLOSED'))
          throw error;
      }
    }
    // A starting turn can advertise steer after the composer has already submitted.
    // Recheck at the next dequeue instead of waiting inside the new-turn lock.
    if (await redis?.exists(this.streamActiveKey(scope))) return;
    const message = await prepareSteer(
      body,
      namespaceId,
      conversationId,
      userId,
      this.steerAttachments!,
      this.steerResources!,
    );
    const stream = await this.openUserAgentStream(
      userId,
      namespaceId,
      {
        ...message,
        conversation_id: conversationId,
        tools: message.tools,
        edition: body.edition,
        level: body.level,
        enable_thinking: body.enable_thinking,
        channel: body.channel,
        lang: body.lang,
        parent_message_id: body.parent_message_id,
        follow_latest: true,
      },
      runId,
      'ask',
      timeZone,
      body.parent_message_id ? 'explicit' : 'latest',
      { platform: job.platform ?? 'web' },
      Date.now(),
      fingerprint,
    );
    // The session owns generation. A receipt only waits for the persisted user row.
    const admitted = await firstValueFrom(
      stream.pipe(
        map((event) => JSON.parse(event.data as string) as ChatResponse),
        filter(
          (chunk) =>
            chunk.response_type === 'error' ||
            (chunk.response_type === 'bos' &&
              chunk.role === OpenAIMessageRole.USER),
        ),
      ),
    );
    if (admitted.response_type === 'error')
      throw new AppException(
        admitted.message,
        admitted.code || 'MESSAGE_REJECTED',
        admitted.status || HttpStatus.BAD_REQUEST,
      );
    if (
      admitted.response_type !== 'bos' ||
      admitted.attrs?.client_request_id !== runId
    )
      throw new ConflictException('Unexpected message receipt');
    return {
      id: admitted.id,
      run_id: runId,
      client_request_id: runId,
      disposition: 'started',
    };
  }

  async submitSteer(
    namespaceId: string,
    conversationId: string,
    userId: string,
    runId: string,
    body: AgentRequestDto,
    fingerprint?: string,
    behavior?: BehaviorContext,
  ) {
    await this.conversationsService.findOneForUserInNamespace(
      conversationId,
      userId,
      namespaceId,
    );
    const redis = await this.getRedisClient();
    const key = getStreamKey(namespaceId, conversationId, userId);
    const token = await redis?.get(`wizard:steer-route:${key}:${runId}`);
    if (!redis || !token)
      throw new AppException(
        'Run is no longer accepting messages',
        'STEER_CLOSED',
        HttpStatus.CONFLICT,
      );
    const message = await prepareSteer(
      body,
      namespaceId,
      conversationId,
      userId,
      this.steerAttachments!,
      this.steerResources!,
    );
    const inbox = 'wizard:steer:' + token;
    const accepted = await redis.eval(APPEND_STEER, {
      keys: [inbox, inbox + ':messages'],
      arguments: [
        message.client_request_id!,
        JSON.stringify({
          ...message,
          ...(fingerprint ? { submission_fingerprint: fingerprint } : {}),
          ...(behavior ? { behavior } : {}),
        }),
        String(STREAM_TTL_SECONDS),
      ],
    });
    if (accepted === 0)
      throw new AppException(
        'Run is no longer accepting messages',
        'STEER_CLOSED',
        HttpStatus.CONFLICT,
      );
    if (accepted !== 1) throw new ConflictException('Request ID conflict');
    // An approval pause, stop or stream failure may end the run before delivery.
    // Only acknowledge after its user message has reached conversation history.
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const [saved, running] = await redis.hmGet(inbox, [
        'saved:' + message.client_request_id,
        'running',
      ]);
      if (saved)
        return {
          id: saved,
          run_id: runId,
          client_request_id: message.client_request_id,
        };
      if (!running)
        throw new AppException(
          'Run finished before applying this message',
          'STEER_CLOSED',
          HttpStatus.CONFLICT,
        );
      await this.sleep(300);
    }
    throw new GatewayTimeoutException(
      'Steer delivery pending; retry with the same request ID',
    );
  }

  async readSteer(
    token: string,
    cursor: number,
    finish: boolean,
    wait = false,
  ) {
    if (
      !isUUID(token) ||
      !Number.isSafeInteger(cursor) ||
      cursor < 0 ||
      typeof finish !== 'boolean'
    )
      throw new BadRequestException();
    const redis = await this.getRedisClient();
    if (!redis) throw new ConflictException();
    const inbox = 'wizard:steer:' + token;
    const read = async () => {
      const gate =
        (await redis.hGet(inbox, 'save_gate')) || inbox + ':save-gate';
      const rows = (await redis.eval(READ_STEER, {
        keys: [inbox, inbox + ':messages', gate],
        arguments: [
          String(cursor),
          finish ? '1' : '0',
          String(STREAM_TTL_SECONDS),
          String(Date.now()),
        ],
      })) as Array<string | [string, string]>;
      return rows.map(decodeSteerItem);
    };
    if (!wait || finish || !(await redis.hExists(inbox, 'open'))) return read();
    const subscriber = await this.getRedisSubscriber();
    if (!subscriber) return read();
    const channel = ((await redis.hGet(inbox, 'queue')) || inbox) + ':wake';
    let wake!: () => void;
    const signal = new Promise<void>((resolve) => {
      wake = resolve;
    });
    await subscriber.subscribe(channel, wake);
    const timer = setTimeout(wake, 10000);
    try {
      // Subscribe before reading so that an arrival between the two cannot be missed.
      const rows = await read();
      if (rows.length) return rows;
      await signal;
      return await read();
    } finally {
      clearTimeout(timer);
      await subscriber.unsubscribe(channel, wake);
    }
  }

  async cancelUserAgentStream(
    userId: string,
    namespaceId: string,
    conversationId: string,
  ) {
    await this.conversationsService.findOneForUserInNamespace(
      conversationId,
      userId,
      namespaceId,
    );
    await this.cancelAgentStream(
      getStreamKey(namespaceId, conversationId, userId),
      namespaceId,
      conversationId,
      userId,
    );
  }

  async cancelShareAgentStream(share: Share, conversationId: string) {
    await this.cancelAgentStream(
      getStreamKey(share.namespaceId, conversationId, '', share.id),
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
    if (userId)
      await this.agentStreamHooks.onCancellationRequested?.(
        userId,
        conversationId,
      );
    await this.markSessionCanceled(key);
    const session = this.streamSessions.get(key);
    if (session) {
      await this.stopSession(session);
      return;
    }
    await this.messagesService.stopRunning(namespaceId, conversationId, userId);
    const client = await this.getRedisClient();
    if (client) {
      await client.publish(this.streamControlChannel(key), 'cancel');
    }
  }

  /**
   * Reliable stop path for the save preemption. Unlike cancelAgentStream, a
   * rejecting deployment-cancellation hook cannot skip the essential local
   * stop/mark/remote-stop steps. Returns whether a stopped row was written and
   * whether the run was just pausing at an approval (not a stop target).
   */
  private async cancelAgentStreamReliable(
    key: string,
    namespaceId: string,
    conversationId: string,
    userId: string,
  ): Promise<{ applied: boolean; pausing: boolean }> {
    const session = this.streamSessions.get(key);
    if (session) {
      if (session.handlerContext.interrupted)
        return { applied: false, pausing: true };
      // A session registered by an admission still persisting its query row
      // has no run identity yet; stopping it there would abort the run without
      // a stop stamp and the bot would report a generic failure.
      await this.waitForAdmission(session, STOP_ADMISSION_WAIT_MS);
      // stopSession already swallows the deployment hook and marks the
      // session canceled; calling either again would duplicate work.
      const stopped = await this.stopSession(session);
      return { applied: Boolean(stopped), pausing: false };
    }
    // A run writing its interrupt row while closing is treated as pausing;
    // rewriting the paused turn is outside the save's stop target.
    const latest = await this.messagesService.findLatest(
      userId,
      conversationId,
    );
    if (latest?.attrs?.tool_call?.interrupts?.length)
      return { applied: false, pausing: true };
    if (userId) {
      try {
        await this.agentStreamHooks.onCancellationRequested?.(
          userId,
          conversationId,
        );
      } catch (error) {
        this.logger.error({ error });
      }
    }
    // The run can persist its interrupt while the hook runs; stopping after
    // that would rewrite the paused turn and lose the approval prompt.
    const current = await this.messagesService.findLatest(
      userId,
      conversationId,
    );
    if (current?.attrs?.tool_call?.interrupts?.length)
      return { applied: false, pausing: true };
    // A completed answer waiting for its done must still be delivered; do
    // not mark the run canceled or stamp it stopped.
    if (await this.isRemoteRunAlreadyComplete(key, current))
      return { applied: false, pausing: false };
    await this.markSessionCanceled(key);
    const stopped = await this.messagesService.stopRunning(
      namespaceId,
      conversationId,
      userId,
    );
    const client = await this.getRedisClient();
    if (client) {
      await client.publish(this.streamControlChannel(key), 'cancel');
    }
    return { applied: Boolean(stopped), pausing: false };
  }

  /**
   * Stop the owner's streaming run and wait, bounded, for its stream scope to
   * close. `stopped` means a stopped row was written and the scope closed;
   * `closed` means no stopped row was written and the scope closed (typically
   * the completed-answer no-op); `unconfirmed` means the scope stayed open or
   * the poll failed after an attempt. A run that is just pausing at an
   * approval (`pausing`) and an unreadable stream state (`unknown`) are
   * skipped without a stop.
   */
  async stopUserAgentStreamAndWait(
    userId: string,
    namespaceId: string,
    conversationId: string,
    timeoutMs = 10_000,
  ): Promise<StopStreamOutcome> {
    const key = getStreamKey(namespaceId, conversationId, userId);
    try {
      if (
        !(await this.isConversationStreaming(
          namespaceId,
          conversationId,
          userId,
        ))
      )
        return 'idle';
    } catch (error) {
      this.logger.error({ error });
      return 'unknown';
    }
    let applied = false;
    try {
      const stop = await this.cancelAgentStreamReliable(
        key,
        namespaceId,
        conversationId,
        userId,
      );
      if (stop.pausing) return 'pausing';
      applied = stop.applied;
    } catch (error) {
      this.logger.error({ error });
    }
    const deadline = Date.now() + timeoutMs;
    let confirmed = false;
    while (Date.now() <= deadline) {
      try {
        if (
          !(await this.isConversationStreaming(
            namespaceId,
            conversationId,
            userId,
          ))
        ) {
          confirmed = true;
          break;
        }
      } catch (error) {
        this.logger.error({ error });
        break;
      }
      await this.sleep(100);
    }
    if (!confirmed) return 'unconfirmed';
    return applied ? 'stopped' : 'closed';
  }

  async createUserAgentStream(
    userId: string,
    namespaceId: string,
    requestDto: AgentRequestDto,
    requestId: string,
    mode: 'ask' | 'write',
    timeZone?: string,
    parentMode: 'latest' | 'explicit' = 'explicit',
    traceContext: ChatClientTraceContext = {},
  ): Promise<Observable<MessageEvent>> {
    const queryReceivedAt = Date.now();
    try {
      await this.conversationsService.findOneForUserInNamespace(
        requestDto.conversation_id,
        userId,
        namespaceId,
      );
      return await this.openUserAgentStream(
        userId,
        namespaceId,
        requestDto,
        requestId,
        mode,
        timeZone,
        parentMode,
        traceContext,
        queryReceivedAt,
      );
    } catch (e) {
      return this.errorChunkStream(e, {
        userId,
        namespaceId,
        conversationId: requestDto.conversation_id,
        requestId,
        channel: requestDto.channel,
        ...traceContext,
        stage: 'transport',
        clientState: 'sending',
      });
    }
  }

  // Throws instead of answering with an error chunk, so the Open API keeps
  // its HTTP status and JSON body (e.g. 409 PENDING_INTERRUPT for the bots).
  private async openUserAgentStream(
    userId: string,
    namespaceId: string,
    requestDto: AgentRequestDto,
    requestId: string,
    mode: 'ask' | 'write',
    timeZone?: string,
    parentMode: 'latest' | 'explicit' = 'explicit',
    traceContext: ChatClientTraceContext = {},
    queryReceivedAt?: number,
    fingerprint?: string,
  ): Promise<Observable<MessageEvent>> {
    if (mode === 'write') {
      requestDto.tools =
        (await this.expandVisibleResources(
          namespaceId,
          userId,
          requestDto.tools,
        )) ?? requestDto.tools;
    } else {
      // The core target expands inside stream(); an Agent 2.1 turn gets the
      // same list lazily from wizard-pro, so a client-supplied one must not
      // pin the search scope.
      for (const tool of requestDto.tools || []) {
        if (tool.name === 'private_search') {
          delete tool.visible_resources;
        }
      }
    }
    return await this.createAgentStream(
      namespaceId,
      requestDto,
      requestId,
      mode,
      userId,
      '',
      false,
      timeZone,
      parentMode,
      traceContext,
      queryReceivedAt,
      fingerprint,
    );
  }

  async createShareAgentStream(
    share: Share,
    requestDto: AgentRequestDto,
    requestId: string,
    mode: 'ask' | 'write',
    timeZone?: string,
    traceContext: ChatClientTraceContext = {},
  ): Promise<Observable<MessageEvent>> {
    const queryReceivedAt = Date.now();
    try {
      for (const tool of requestDto.tools || []) {
        if (tool.name === 'private_search') {
          tool.visible_resources = await this.getShareVisibleResources(
            share,
            tool.resources || [],
          );
        }
      }
      return await this.createAgentStream(
        share.namespaceId,
        requestDto,
        requestId,
        mode,
        '',
        share.id,
        share.shareType === ShareType.CHAT_ONLY,
        timeZone,
        'explicit',
        traceContext,
        queryReceivedAt,
      );
    } catch (e) {
      return this.errorChunkStream(e, {
        namespaceId: share.namespaceId,
        conversationId: requestDto.conversation_id,
        requestId,
        channel: requestDto.channel,
        ...traceContext,
        shareId: share.id,
        stage: 'transport',
        clientState: 'sending',
      });
    }
  }

  async chat(
    userId: string,
    namespaceId: string,
    body: AgentRequestDto,
    requestId: string,
    mode: 'ask' | 'write' = 'ask',
    parentMode: 'latest' | 'explicit' = 'explicit',
  ): Promise<any> {
    const queryReceivedAt = Date.now();
    await this.conversationsService.findOneForUserInNamespace(
      body.conversation_id,
      userId,
      namespaceId,
    );
    const observable = await this.openUserAgentStream(
      userId,
      namespaceId,
      body,
      requestId,
      mode,
      undefined,
      parentMode,
      {},
      queryReceivedAt,
    );

    const chunks: ChatResponse[] = [];

    return new Promise((resolve, reject) => {
      observable.subscribe({
        next: (event: MessageEvent) => {
          const chunk: ChatResponse = JSON.parse(event.data as string);
          chunks.push(chunk);
        },
        complete: () => {
          const preflightError = chunks.find(
            (
              chunk,
            ): chunk is ChatErrorResponse & {
              status: number;
              code: string;
            } =>
              chunk.response_type === 'error' &&
              typeof chunk.status === 'number' &&
              typeof chunk.code === 'string',
          );
          if (preflightError) {
            // A preflight failure never reached the wizard, so the Open API
            // keeps the HTTP status and code it returned before the expansion
            // moved into the turn. In-stream errors carry no status and keep
            // the existing chunk merging.
            reject(
              new AppException(
                preflightError.message,
                preflightError.code,
                preflightError.status,
              ),
            );
            return;
          }
          resolve(chunks);
        },
        error: (error: Error) => {
          reject(error);
        },
      });
    });
  }
}
