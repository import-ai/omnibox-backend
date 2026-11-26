import { randomUUID } from 'crypto';
import { createClient } from 'redis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

import { MessageStatus } from '../messages/entities/message.entity';
import {
  ConversationSubmissions,
  submissionFingerprint,
} from './conversation-submissions';
import { AgentRequestChannel } from './dto/agent-request.dto';
import { saveGateKey } from './save-gate';
import { decodeSteerItem, READ_STEER_INPUT } from './steer';
import { StreamService } from './stream.service';
import { getStreamKey } from './stream-key';

describe('Conversation submission recovery with Redis', () => {
  let container: StartedTestContainer;
  let redis: ReturnType<typeof createClient>;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    redis = createClient({
      url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    });
    await redis.connect();
  });

  afterAll(async () => {
    if (redis?.isOpen) await redis.quit();
    await container?.stop();
  });

  it('recovers an old queued Steer, then rejects changed tools and never requeues a stopped message after expiry', async () => {
    const requestId = randomUUID();
    const runId = randomUUID();
    const token = randomUUID();
    const input = {
      client_request_id: requestId,
      query: 'Continue',
      images: [],
      tools: [],
    };
    const job = {
      userId: 'user',
      namespaceId: 'space',
      conversationId: 'conversation',
      body: {
        ...input,
        conversation_id: 'conversation',
        channel: AgentRequestChannel.OPEN_API,
      },
    };
    const queue = new ConversationSubmissions(redis, 'submissions');
    const key = queue.key(
      getStreamKey(job.namespaceId, job.conversationId, job.userId),
    );
    const record = key + ':' + requestId;
    const inbox = 'wizard:steer:' + token;
    await queue.add(key, job, JSON.stringify(input));
    await redis.hSet(inbox, { open: '1', queue: key, run: runId });

    const messageId = randomUUID();
    const row = {
      id: messageId,
      status: MessageStatus.STOPPED,
      message: { role: 'user', content: undefined as string | undefined },
      attrs: {
        turn_run_id: runId,
        submission_fingerprint: undefined as string | undefined,
      },
    };
    const processSubmission = jest.fn();
    const service: StreamService = Object.assign(
      Object.create(StreamService.prototype),
      {
        conversationsService: { findOneForUserInNamespace: jest.fn() },
        messagesService: { findSubmitted: jest.fn().mockResolvedValue(row) },
        getRedisClient: () => redis,
        submissionQueue: () => queue,
        processSubmission,
      },
    );
    const [steer] = await service.readSteer(token, 0, false);
    const fingerprint = submissionFingerprint(job.body);
    expect(steer).toEqual({ ...input, submission_fingerprint: fingerprint });
    const legacy = (await redis.eval(READ_STEER_INPUT, {
      keys: [inbox],
      arguments: [requestId],
    })) as [string, string];
    expect(decodeSteerItem(legacy)).toEqual(steer);

    const send = (tools: Array<{ name: 'web_search' }> = []) =>
      service.submitConversationMessage(
        job.namespaceId,
        job.conversationId,
        job.userId,
        { ...job.body, tools },
      );
    // An existing Redis receipt still wins while a legacy DB row lacks a digest.
    await expect(send()).resolves.toMatchObject({ disposition: 'queued' });
    await expect(send([{ name: 'web_search' }])).rejects.toMatchObject({
      status: 409,
    });
    processSubmission.mockClear();
    row.attrs.submission_fingerprint = fingerprint;
    const stopped = {
      disposition: 'failed' as const,
      id: messageId,
      run_id: runId,
      client_request_id: requestId,
      error: 'Message was stopped',
    };
    await queue.process(key, () => Promise.resolve(stopped));
    expect(await redis.ttl(record)).toBeGreaterThan(0);
    await redis.pExpire(record, 0);

    row.status = MessageStatus.SUCCESS;
    row.message.content = input.query;
    await expect(send()).resolves.toEqual({
      disposition: 'steered',
      id: messageId,
      run_id: runId,
      client_request_id: requestId,
    });
    row.status = MessageStatus.STOPPED;
    delete row.message.content;
    await expect(send()).resolves.toEqual(stopped);
    await expect(send([{ name: 'web_search' }])).rejects.toMatchObject({
      status: 409,
    });
    const laterToken = randomUUID();
    await redis.hSet('wizard:steer:' + laterToken, {
      open: '1',
      queue: key,
      run: randomUUID(),
    });
    await expect(service.readSteer(laterToken, 0, false)).resolves.toEqual([]);
    expect(await redis.exists(record)).toBe(0);
    expect(await redis.lLen(key)).toBe(0);
    expect(processSubmission).not.toHaveBeenCalled();
  });
});

describe('Pending save gate with Redis', () => {
  let container: StartedTestContainer;
  let redis: ReturnType<typeof createClient>;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    redis = createClient({
      url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    });
    await redis.connect();
  });

  afterAll(async () => {
    if (redis?.isOpen) await redis.quit();
    await container?.stop();
  });

  function service() {
    return Object.assign(Object.create(StreamService.prototype), {
      conversationsService: { findOneForUserInNamespace: jest.fn() },
      messagesService: { findSubmitted: jest.fn() },
      getRedisClient: () => redis,
    }) as StreamService;
  }

  async function queuedInput(
    requestId: string,
    query: string,
    token: string = randomUUID(),
    namespaceId: string = 'space-' + randomUUID(),
  ): Promise<{
    key: string;
    record: string;
    inbox: string;
    token: string;
    namespaceId: string;
  }> {
    const conversationId = 'conversation';
    const userId = 'user';
    const input = {
      client_request_id: requestId,
      query,
      images: [],
      tools: [],
    };
    const job = {
      userId,
      namespaceId,
      conversationId,
      body: {
        ...input,
        conversation_id: conversationId,
        channel: AgentRequestChannel.OPEN_API,
      },
    };
    const queue = new ConversationSubmissions(redis, 'submissions');
    const key = queue.key(getStreamKey(namespaceId, conversationId, userId));
    await queue.add(key, job, JSON.stringify(input));
    const inbox = 'wizard:steer:' + token;
    await redis.hSet(inbox, {
      open: '1',
      queue: key,
      run: randomUUID(),
      save_gate: saveGateKey(getStreamKey(namespaceId, conversationId, userId)),
    });
    return { key, record: key + ':' + requestId, inbox, token, namespaceId };
  }

  it('does not assign queued input while a save is pending and assigns it after the clear', async () => {
    const stream = service();
    const requestId = randomUUID();
    const { record, inbox, token, namespaceId } = await queuedInput(
      requestId,
      'ask2',
    );
    const gateToken = randomUUID();
    await stream.beginPendingSave(
      namespaceId,
      'conversation',
      'user',
      gateToken,
      60_000,
    );

    await expect(stream.readSteer(token, 0, false)).resolves.toEqual([]);
    expect(await redis.hGet(record, 'inbox')).toBeNull();

    await stream.endPendingSave(namespaceId, 'conversation', 'user', gateToken);
    const [steer] = await stream.readSteer(token, 0, false);
    expect(steer).toMatchObject({
      client_request_id: requestId,
      query: 'ask2',
    });
    expect(await redis.hGet(record, 'inbox')).toBe(inbox);
  });

  it('still returns items already in the inbox while gated', async () => {
    const stream = service();
    const first = await queuedInput(randomUUID(), 'ask1');
    const [initial] = await stream.readSteer(first.token, 0, false);
    expect(initial).toMatchObject({ query: 'ask1' });

    const second = await queuedInput(
      randomUUID(),
      'ask2',
      first.token,
      first.namespaceId,
    );
    const gateToken = randomUUID();
    await stream.beginPendingSave(
      first.namespaceId,
      'conversation',
      'user',
      gateToken,
      60_000,
    );

    const held = await stream.readSteer(first.token, 0, false);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ query: 'ask1' });
    expect(await redis.hGet(second.record, 'inbox')).toBeNull();
  });

  it('tracks concurrent save tokens and per-token expiry', async () => {
    const stream = service();
    const longToken = randomUUID();
    const shortToken = randomUUID();
    await stream.beginPendingSave(
      'space',
      'conversation',
      'user',
      shortToken,
      20,
    );
    await stream.beginPendingSave(
      'space',
      'conversation',
      'user',
      longToken,
      60_000,
    );
    await expect(
      stream.isSavePending('space', 'conversation', 'user'),
    ).resolves.toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 40));
    // The short token expired; the long one still gates.
    await expect(
      stream.isSavePending('space', 'conversation', 'user'),
    ).resolves.toBe(true);

    await stream.endPendingSave('space', 'conversation', 'user', longToken);
    await expect(
      stream.isSavePending('space', 'conversation', 'user'),
    ).resolves.toBe(false);

    // A repeated token is the same token (the bot's heartbeat).
    const heartbeated = randomUUID();
    await stream.beginPendingSave(
      'space',
      'conversation',
      'user',
      heartbeated,
      60_000,
    );
    await stream.beginPendingSave(
      'space',
      'conversation',
      'user',
      heartbeated,
      60_000,
    );
    await stream.endPendingSave('space', 'conversation', 'user', heartbeated);
    await expect(
      stream.isSavePending('space', 'conversation', 'user'),
    ).resolves.toBe(false);
  });
});
