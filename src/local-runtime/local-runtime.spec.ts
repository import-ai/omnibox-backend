import { randomUUID } from 'node:crypto';

import { I18nService } from 'nestjs-i18n';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { LocalRuntime1790517163547 } from '../migrations/1790517163547-local-runtime';
import { LocalDevice } from './entities/local-device.entity';
import {
  LocalExecution,
  LocalExecutionEvent,
} from './entities/local-execution.entity';
import { LocalRuntimeService } from './local-runtime.service';

jest.setTimeout(120000);
describe('Local runtime durable delivery', () => {
  let container: StartedTestContainer;
  let db: DataSource;
  let service: LocalRuntimeService;
  let other: LocalRuntimeService;
  const user = randomUUID();
  const stranger = randomUUID();
  const device = randomUUID();
  const secret = 'a'.repeat(64);
  const conversation = randomUUID();
  beforeAll(async () => {
    container = await new GenericContainer('postgres:17.5')
      .withEnvironment({
        POSTGRES_PASSWORD: 'runtime-test',
        POSTGRES_DB: 'runtime',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage('database system is ready to accept connections', 2),
      )
      .start();
    db = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getMappedPort(5432),
      username: 'postgres',
      password: 'runtime-test',
      database: 'runtime',
      entities: [LocalDevice, LocalExecution, LocalExecutionEvent],
      namingStrategy: new SnakeNamingStrategy(),
    });
    await db.initialize();
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.query('CREATE TABLE users(id uuid PRIMARY KEY)');
    await db.query('INSERT INTO users VALUES($1),($2)', [user, stranger]);
    const runner = db.createQueryRunner();
    await new LocalRuntime1790517163547().up(runner);
    await runner.release();
    const conversations = {
      findOneForUserInNamespace: jest.fn((_id: string, owner: string) => {
        if (owner !== user) throw new Error('Denied');
        return Promise.resolve({ shareId: null });
      }),
    } as unknown as ConversationsService;
    const i18n = { t: (s: string) => s } as unknown as I18nService;
    service = new LocalRuntimeService(db, conversations, i18n);
    other = new LocalRuntimeService(db, conversations, i18n);
  });
  afterAll(async () => {
    service?.onModuleDestroy();
    other?.onModuleDestroy();
    await db?.destroy();
    await container?.stop();
  });
  const create = (tool = randomUUID()) =>
    service.create(user, 'space', {
      device_id: device,
      conversation_id: conversation,
      tool_call_id: tool,
      command: 'echo test',
      cwd: '~',
      timeout_seconds: 30,
    });
  const report = (id: string, sequence: number, status: any) =>
    service.report(user, device, secret, id, {
      events: [{ sequence, kind: 'status', status, data: status }],
    });
  it('migrates snake_case columns, isolates credentials and binds device ownership', async () => {
    const registered = await service.register(user, {
      id: device,
      secret,
      name: 'Mac',
      platform: 'darwin',
      shell: '/bin/sh',
    });
    expect(registered).not.toHaveProperty('secretHash');
    await expect(service.device(stranger, device, secret)).rejects.toThrow();
    await expect(
      service.device(user, device, 'b'.repeat(64)),
    ).rejects.toThrow();
    await expect(
      service.register(stranger, {
        id: device,
        secret,
        name: 'Hijack',
        platform: 'darwin',
        shell: '/bin/sh',
      }),
    ).rejects.toThrow();
    expect(await service.list(stranger)).toEqual([]);
  });
  it('redelivers a lost response without creating or concurrently delivering another execution', async () => {
    const key = randomUUID();
    const e = await create(key);
    expect((await create(key)).id).toBe(e.id);
    const a = await service.poll(user, device, secret, {
      command_policy: 'ask',
      paused: false,
    });
    expect(a?.id).toBe(e.id);
    const abort = new AbortController();
    const b = other.poll(
      user,
      device,
      secret,
      { command_policy: 'ask', paused: false },
      abort.signal,
    );
    setTimeout(() => abort.abort(), 100);
    expect(await b).toBeNull();
    await db
      .getRepository(LocalExecution)
      .update(e.id, { deliverAfter: new Date(0) });
    expect(
      (
        await other.poll(user, device, secret, {
          command_policy: 'ask',
          paused: false,
        })
      )?.id,
    ).toBe(e.id);
    await expect(report(e.id, 1, 'running')).rejects.toThrow();
    await report(e.id, 1, 'awaiting_approval');
    await expect(service.decide(stranger, e.id, 'approve')).rejects.toThrow();
    await service.decide(user, e.id, 'approve');
    expect(
      (
        await service.poll(user, device, secret, {
          command_policy: 'ask',
          paused: false,
        })
      )?.approvedAt,
    ).toBeTruthy();
    await report(e.id, 2, 'running');
    await service.report(user, device, secret, e.id, {
      events: [{ sequence: 3, kind: 'stdout', data: 'test\n' }],
    });
    await service.report(user, device, secret, e.id, {
      events: [{ sequence: 3, kind: 'stdout', data: 'test\n' }],
    });
    await expect(
      service.report(user, device, secret, e.id, {
        events: [{ sequence: 5, kind: 'stdout', data: 'gap' }],
      }),
    ).rejects.toThrow();
    await report(e.id, 4, 'succeeded');
    expect((await service.events(user, e.id)).length).toBe(4);
    await expect(report(e.id, 5, 'running')).rejects.toThrow();
  });
  it('delivers cancellation during execution and rejects expired approvals', async () => {
    const e = await create();
    await service.poll(user, device, secret, {
      command_policy: 'allow',
      paused: false,
    });
    await report(e.id, 1, 'running');
    await service.cancelConversation(user, conversation);
    expect(
      (
        await service.poll(user, device, secret, {
          command_policy: 'allow',
          paused: false,
        })
      )?.action,
    ).toBe('cancel');
    await report(e.id, 2, 'canceled');
    const pending = await create();
    await service.poll(user, device, secret, {
      command_policy: 'ask',
      paused: false,
    });
    await report(pending.id, 1, 'awaiting_approval');
    await db
      .getRepository(LocalExecution)
      .update(pending.id, { approvalExpiresAt: new Date(0) });
    await expect(service.decide(user, pending.id, 'approve')).rejects.toThrow();
    expect(
      (
        await service.poll(user, device, secret, {
          command_policy: 'ask',
          paused: false,
        })
      )?.action,
    ).toBe('cancel');
    await report(pending.id, 2, 'canceled');
  });
  it('revokes a device while preserving event recovery', async () => {
    const e = await create();
    await service.poll(user, device, secret, {
      command_policy: 'allow',
      paused: false,
    });
    await report(e.id, 1, 'running');
    await service.revoke(user, device);
    await expect(
      service.poll(user, device, secret, {
        command_policy: 'allow',
        paused: false,
      }),
    ).rejects.toThrow();
    await report(e.id, 2, 'canceled');
    expect((await service.list(user))[0].online).toBe(false);
  });
});
