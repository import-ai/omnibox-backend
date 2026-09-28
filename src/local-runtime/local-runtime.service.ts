import { createHash, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { DataSource, In, IsNull } from 'typeorm';

import { LocalDevice } from './entities/local-device.entity';
import {
  LocalExecution,
  LocalExecutionEvent,
} from './entities/local-execution.entity';
import {
  CreateLocalExecutionRequestDto,
  PollLocalDeviceRequestDto,
  RegisterLocalDeviceRequestDto,
  ReportLocalExecutionRequestDto,
} from './local-runtime.dto';
import { canReport, TERMINAL } from './runtime-state';

@Injectable()
export class LocalRuntimeService implements OnModuleDestroy {
  private waiters = new Map<string, Set<() => void>>();
  private checking = false;
  private timer = setInterval(() => void this.checkWaiters(), 1000);
  constructor(
    private readonly db: DataSource,
    private readonly conversations: ConversationsService,
    private readonly i18n: I18nService,
  ) {
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
    for (const callbacks of this.waiters.values())
      for (const wake of callbacks) wake();
  }
  private fail(key: string, status = HttpStatus.CONFLICT): never {
    throw new AppException(
      this.i18n.t(`local_runtime.${key}`),
      `LOCAL_RUNTIME_${key.toUpperCase()}`,
      status,
    );
  }
  private hash(secret: string) {
    return createHash('sha256').update(secret).digest('hex');
  }
  async register(userId: string, dto: RegisterLocalDeviceRequestDto) {
    const repo = this.db.getRepository(LocalDevice);
    await repo
      .createQueryBuilder()
      .insert()
      .values({
        id: dto.id,
        userId,
        name: dto.name,
        platform: dto.platform,
        shell: dto.shell,
        secretHash: this.hash(dto.secret),
        commandPolicy: 'ask',
        lastSeenAt: new Date(),
      })
      .orIgnore()
      .execute();
    return this.device(userId, dto.id, dto.secret);
  }
  async device(
    userId: string,
    id: string,
    secret?: string,
    manager = this.db.manager,
    revoked = false,
  ) {
    const device = await manager
      .getRepository(LocalDevice)
      .createQueryBuilder('d')
      .addSelect('d.secretHash')
      .where('d.id = :id AND d.userId = :userId', { id, userId })
      .getOne();
    if (!device) this.fail('not_found', HttpStatus.NOT_FOUND);
    if (secret !== undefined) {
      if (
        !/^[a-f0-9]{64}$/.test(secret) ||
        !timingSafeEqual(
          Buffer.from(device.secretHash, 'hex'),
          Buffer.from(this.hash(secret), 'hex'),
        )
      )
        this.fail('unauthorized', HttpStatus.UNAUTHORIZED);
    }
    if (device.revokedAt && !revoked) this.fail('revoked', HttpStatus.GONE);
    Reflect.deleteProperty(device, 'secretHash');
    return device;
  }
  async list(userId: string) {
    return (
      await this.db
        .getRepository(LocalDevice)
        .find({ where: { userId }, order: { createdAt: 'DESC' } })
    ).map((d) => ({
      ...d,
      online:
        !d.revokedAt &&
        !!d.lastSeenAt &&
        Date.now() - d.lastSeenAt.getTime() < 60_000,
    }));
  }
  async rename(userId: string, id: string, name: string) {
    const device = await this.device(userId, id);
    if (
      !device.lastSeenAt ||
      Date.now() - device.lastSeenAt.getTime() >= 60_000
    )
      this.fail('offline');
    await this.db.getRepository(LocalDevice).update({ id, userId }, { name });
  }
  async revoke(userId: string, id: string) {
    await this.device(userId, id, undefined, this.db.manager, true);
    await this.db
      .getRepository(LocalDevice)
      .update({ id, userId }, { revokedAt: new Date() });
    for (const e of await this.db
      .getRepository(LocalExecution)
      .find({ where: { deviceId: id, userId } }))
      if (!TERMINAL.has(e.status)) await this.cancel(userId, e.id);
    this.wake(id);
  }
  async create(
    userId: string,
    namespaceId: string,
    dto: CreateLocalExecutionRequestDto,
  ) {
    const conversation = await this.conversations.findOneForUserInNamespace(
      dto.conversation_id,
      userId,
      namespaceId,
    );
    if (conversation.shareId) this.fail('unauthorized', HttpStatus.FORBIDDEN);
    const existing = await this.db.getRepository(LocalExecution).findOneBy({
      userId,
      conversationId: dto.conversation_id,
      toolCallId: dto.tool_call_id,
    });
    if (existing) {
      if (
        existing.deviceId !== dto.device_id ||
        existing.command !== dto.command ||
        existing.cwd !== dto.cwd ||
        existing.timeoutSeconds !== dto.timeout_seconds
      )
        this.fail('changed');
      return existing;
    }
    const d = await this.device(userId, dto.device_id);
    if (
      d.paused ||
      !d.lastSeenAt ||
      Date.now() - d.lastSeenAt.getTime() > 60_000
    )
      this.fail('offline');
    await this.db
      .getRepository(LocalExecution)
      .createQueryBuilder()
      .insert()
      .values({
        userId,
        namespaceId,
        conversationId: dto.conversation_id,
        toolCallId: dto.tool_call_id,
        deviceId: dto.device_id,
        command: dto.command,
        cwd: dto.cwd,
        timeoutSeconds: dto.timeout_seconds,
      })
      .orIgnore()
      .execute();
    this.wake(d.id);
    const result = await this.db.getRepository(LocalExecution).findOneByOrFail({
      userId,
      conversationId: dto.conversation_id,
      toolCallId: dto.tool_call_id,
    });
    if (
      result.deviceId !== dto.device_id ||
      result.command !== dto.command ||
      result.cwd !== dto.cwd ||
      result.timeoutSeconds !== dto.timeout_seconds
    )
      this.fail('changed');
    return result;
  }
  async executions(userId: string, conversationId?: string, offset = 0) {
    return this.db.getRepository(LocalExecution).find({
      where: { userId, ...(conversationId ? { conversationId } : {}) },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: Math.max(0, offset),
      take: 100,
    });
  }
  async execution(userId: string, id: string) {
    const e = await this.db
      .getRepository(LocalExecution)
      .findOneBy({ id, userId });
    if (!e) this.fail('not_found', HttpStatus.NOT_FOUND);
    return e;
  }
  async events(userId: string, id: string, after = 0) {
    await this.execution(userId, id);
    return this.db
      .getRepository(LocalExecutionEvent)
      .createQueryBuilder('e')
      .where('e.executionId = :id AND e.sequence > :after', { id, after })
      .orderBy('e.sequence', 'ASC')
      .take(100)
      .getMany();
  }
  async decide(userId: string, id: string, decision: 'approve' | 'reject') {
    return this.db.transaction(async (m) => {
      const e = await m.getRepository(LocalExecution).findOne({
        where: { id, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!e) this.fail('not_found', HttpStatus.NOT_FOUND);
      await this.device(userId, e.deviceId, undefined, m);
      if (
        e.status !== 'awaiting_approval' ||
        !e.approvalExpiresAt ||
        e.approvalExpiresAt.getTime() <= Date.now()
      )
        this.fail('expired');
      e.approvals = [
        ...e.approvals,
        { decision, user_id: userId, at: new Date().toISOString() },
      ];
      e.status = decision === 'approve' ? 'approved' : 'cancel_requested';
      e.approvedAt = decision === 'approve' ? new Date() : null;
      e.deliverAfter = null;
      await m.save(e);
      this.wake(e.deviceId);
      return e;
    });
  }
  async cancel(userId: string, id: string) {
    return this.db.transaction(async (m) => {
      const e = await m.getRepository(LocalExecution).findOne({
        where: { id, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!e) this.fail('not_found', HttpStatus.NOT_FOUND);
      if (!TERMINAL.has(e.status)) {
        e.status = 'cancel_requested';
        e.deliverAfter = null;
        await m.save(e);
        this.wake(e.deviceId);
      }
      return e;
    });
  }
  async cancelConversation(userId: string, conversationId: string) {
    for (const e of await this.db.getRepository(LocalExecution).find({
      where: {
        userId,
        conversationId,
        status: In([
          'queued',
          'accepted',
          'awaiting_approval',
          'approved',
          'running',
          'cancel_requested',
        ]),
      },
    }))
      if (!TERMINAL.has(e.status)) await this.cancel(userId, e.id);
  }
  async poll(
    userId: string,
    id: string,
    secret: string,
    dto: PollLocalDeviceRequestDto,
    signal?: AbortSignal,
  ) {
    await this.device(userId, id, secret);
    await this.db.getRepository(LocalDevice).update(
      { id, userId },
      {
        lastSeenAt: new Date(),
        commandPolicy: dto.command_policy,
        paused: dto.paused,
        ...(dto.hostname ? { hostname: dto.hostname } : {}),
      },
    );
    const deadline = Date.now() + 25_000;
    while (!signal?.aborted) {
      // Subscribe before querying so a newly queued command cannot miss its wakeup.
      let finish!: () => void;
      const wait = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const callbacks = this.waiters.get(id) ?? new Set<() => void>();
      callbacks.add(finish);
      this.waiters.set(id, callbacks);
      const timeout = setTimeout(finish, Math.max(1, deadline - Date.now()));
      signal?.addEventListener('abort', finish, { once: true });
      try {
        await this.device(userId, id, secret);
        const command = await this.claim(userId, id, dto.paused);
        if (command) return command;
        if (Date.now() >= deadline) return null;
        await wait;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', finish);
        callbacks.delete(finish);
        if (!callbacks.size) this.waiters.delete(id);
      }
      if (Date.now() >= deadline) return null;
    }
    return null;
  }
  private wake(id: string) {
    for (const wake of this.waiters.get(id) ?? []) wake();
  }
  private async checkWaiters() {
    if (this.checking || !this.waiters.size) return;
    this.checking = true;
    try {
      const ids = [...this.waiters.keys()];
      // ponytail: one batched scan per instance; add database notifications if polling load becomes material.
      const rows: { device_id: string }[] = await this.db.query(
        `SELECT DISTINCT device_id FROM local_executions WHERE device_id = ANY($1::uuid[]) AND status IN ('queued','accepted','approved','cancel_requested','awaiting_approval') AND (deliver_after IS NULL OR deliver_after <= now()) UNION SELECT id AS device_id FROM local_devices WHERE id = ANY($1::uuid[]) AND revoked_at IS NOT NULL`,
        [ids],
      );
      for (const row of rows) this.wake(row.device_id);
    } catch {
      for (const id of this.waiters.keys()) this.wake(id);
    } finally {
      this.checking = false;
    }
  }
  private claim(userId: string, deviceId: string, paused: boolean) {
    return this.db.transaction(async (m) => {
      const device = await m.getRepository(LocalDevice).findOne({
        where: { id: deviceId, userId, revokedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!device) this.fail('revoked', HttpStatus.GONE);
      await m
        .getRepository(LocalExecution)
        .createQueryBuilder()
        .update()
        .set({ status: 'cancel_requested', deliverAfter: null })
        .where(
          'device_id = :deviceId AND status IN (:...statuses) AND approval_expires_at <= now()',
          { deviceId, statuses: ['awaiting_approval', 'approved'] },
        )
        .execute();
      const active = await m.getRepository(LocalExecution).findOne({
        where: {
          deviceId,
          status: In([
            'accepted',
            'awaiting_approval',
            'approved',
            'running',
            'cancel_requested',
          ]),
        },
        order: { createdAt: 'ASC' },
      });
      const e =
        active ??
        (!paused
          ? await m.getRepository(LocalExecution).findOne({
              where: { deviceId, status: 'queued' },
              order: { createdAt: 'ASC' },
            })
          : null);
      if (
        !e ||
        !['queued', 'accepted', 'approved', 'cancel_requested'].includes(
          e.status,
        ) ||
        (e.deliverAfter && e.deliverAfter.getTime() > Date.now())
      )
        return null;
      if (e.status === 'queued') {
        // Reserve the device before delivery, including the lost-response window.
        e.status = 'accepted';
      }
      e.deliveryVersion++;
      e.deliverAfter = new Date(Date.now() + 15_000);
      await m.save(e);
      return {
        ...e,
        action: e.status === 'cancel_requested' ? 'cancel' : 'execute',
      };
    });
  }
  async report(
    userId: string,
    deviceId: string,
    secret: string,
    executionId: string,
    dto: ReportLocalExecutionRequestDto,
  ) {
    await this.device(userId, deviceId, secret, this.db.manager, true);
    return this.db.transaction(async (m) => {
      const e = await m.getRepository(LocalExecution).findOne({
        where: { id: executionId, userId, deviceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!e) this.fail('not_found', HttpStatus.NOT_FOUND);
      const device = await this.device(userId, deviceId, secret, m, true);
      for (const event of dto.events) {
        if (event.sequence <= e.sequence) continue;
        if (event.sequence !== e.sequence + 1) this.fail('sequence');
        if (event.kind === 'status') {
          const approved =
            !device.revokedAt &&
            !device.paused &&
            (device.commandPolicy === 'allow' ||
              (device.commandPolicy === 'ask' &&
                !!e.approvedAt &&
                !!e.approvalExpiresAt &&
                e.approvalExpiresAt.getTime() > Date.now()));
          if (!event.status || !canReport(e.status, event.status, approved))
            this.fail('state');
          e.status = event.status;
          if (event.status === 'awaiting_approval') {
            e.approvalExpiresAt = new Date(Date.now() + 10 * 60_000);
            e.approvedAt = null;
          }
          if (event.status === 'running') e.startedAt = new Date();
          if (TERMINAL.has(event.status)) {
            e.finishedAt = new Date();
            e.exitCode = event.exit_code ?? null;
          }
        } else if (event.status !== undefined || TERMINAL.has(e.status))
          this.fail('state');
        await m.getRepository(LocalExecutionEvent).insert({
          executionId,
          sequence: event.sequence,
          kind: event.kind,
          data: event.data,
        });
        e.sequence = event.sequence;
      }
      await m.save(e);
      this.wake(deviceId);
      return { sequence: e.sequence, status: e.status };
    });
  }
}
