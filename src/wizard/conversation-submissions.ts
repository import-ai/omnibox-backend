import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { createClient } from 'redis';

import type { AgentRequestDto } from './dto/agent-request.dto';

type Redis = ReturnType<typeof createClient>;
export interface ConversationSubmission {
  userId: string;
  namespaceId: string;
  conversationId: string;
  body: AgentRequestDto & { expected_run_id?: string };
  timeZone?: string;
  checkpointDelivery?: boolean;
}

export interface SubmissionReceipt {
  client_request_id: string;
  disposition: 'queued' | 'steered' | 'started' | 'failed';
  id?: string;
  run_id?: string;
  error?: string;
  query?: string;
}

// The sorted set schedules conversations. Each list keeps their accepted inputs in order.
export class ConversationSubmissions {
  constructor(
    private readonly redis: Redis,
    private readonly schedule: string,
  ) {}

  key(scope: string) {
    return this.schedule + ':' + scope;
  }

  async add(key: string, job: ConversationSubmission, payload: string) {
    const id = job.body.client_request_id!;
    const receipt: SubmissionReceipt = {
      disposition: 'queued',
      client_request_id: id,
      query: job.body.query,
    };
    const result = await this.redis.eval(
      `
      local previous = redis.call('HGET', KEYS[2], 'input')
      if previous then
        if redis.call('HGET', KEYS[2], 'fingerprint') ~= ARGV[7] then return false end
        return redis.call('HGET', KEYS[2], 'receipt')
      end
      redis.call('HSET', KEYS[2], 'input', ARGV[1], 'receipt', ARGV[2],
        'payload', ARGV[5], 'target', ARGV[6], 'fingerprint', ARGV[7])
      redis.call('RPUSH', KEYS[1], ARGV[3])
      redis.call('PUBLISH', KEYS[1] .. ':wake', ARGV[3])
      redis.call('ZADD', KEYS[3], 'NX', ARGV[4], KEYS[1])
      return ARGV[2]`,
      {
        keys: [key, key + ':' + id, this.schedule],
        arguments: [
          JSON.stringify(job),
          JSON.stringify(receipt),
          id,
          String(Date.now()),
          payload,
          job.body.expected_run_id ?? '',
          JSON.stringify({ ...job.body, expected_run_id: undefined }),
        ],
      },
    );
    if (!result) throw new ConflictException('Request ID conflict');
    return JSON.parse(String(result)) as SubmissionReceipt;
  }

  async pending(key: string) {
    const [pending, failed] = await Promise.all([
      this.redis.lRange(key, 0, -1),
      this.redis.sMembers(key + ':failed'),
    ]);
    return (
      await Promise.all(
        [...pending, ...failed].map((id) => this.receipt(key, id)),
      )
    ).filter(Boolean);
  }

  async receipt(key: string, id: string): Promise<SubmissionReceipt | null> {
    const value = await this.redis.hGet(key + ':' + id, 'receipt');
    return value ? JSON.parse(value) : null;
  }

  async due() {
    return this.redis.zRangeByScore(this.schedule, 0, Date.now(), {
      LIMIT: { offset: 0, count: 32 },
    });
  }

  async process(
    key: string,
    deliver: (
      job: ConversationSubmission,
    ) => Promise<SubmissionReceipt | undefined>,
  ) {
    const lease = randomUUID();
    const lock = key + ':lock';
    if (!(await this.redis.set(lock, lease, { NX: true, PX: 30000 }))) return;
    await this.redis.zAdd(
      this.schedule,
      { score: Date.now() + 30000, value: key },
      { XX: true },
    );
    const renew = setInterval(() => {
      void this.redis
        .eval(
          "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], 30000) end",
          { keys: [lock], arguments: [lease] },
        )
        .catch(() => undefined);
    }, 10000);
    try {
      const id = await this.redis.lIndex(key, 0);
      if (!id) return;
      const record = key + ':' + id;
      const input = await this.redis.hGet(record, 'input');
      if (!input) throw new Error('Missing queued message');
      const receipt = await deliver(JSON.parse(input));
      await this.redis.eval(
        `
        if redis.call('GET', KEYS[4]) ~= ARGV[1] or redis.call('LINDEX', KEYS[1], 0) ~= ARGV[2] then return end
        if ARGV[3] == '' then
          redis.call('ZADD', KEYS[3], ARGV[4], KEYS[1])
          return
        end
        redis.call('HSET', KEYS[2], 'receipt', ARGV[3])
        if ARGV[5] == 'failed' then
          redis.call('SADD', KEYS[5], ARGV[2])
          redis.call('EXPIRE', KEYS[5], 86400)
        end
        redis.call('EXPIRE', KEYS[2], 86400)
        redis.call('LPOP', KEYS[1])
        if redis.call('LLEN', KEYS[1]) == 0 then redis.call('ZREM', KEYS[3], KEYS[1]) else redis.call('ZADD', KEYS[3], 0, KEYS[1]) end`,
        {
          keys: [key, record, this.schedule, lock, key + ':failed'],
          arguments: [
            lease,
            id,
            receipt ? JSON.stringify(receipt) : '',
            String(Date.now() + 3000),
            receipt?.disposition ?? '',
          ],
        },
      );
    } finally {
      clearInterval(renew);
      await this.redis.eval(
        "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end",
        { keys: [lock], arguments: [lease] },
      );
    }
  }
}
