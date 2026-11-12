import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { TraceService } from 'omniboxd/trace/trace.service';
import { IsNull, Not, Repository } from 'typeorm';

import { BehaviorAction } from './behavior-action.entity';
import type { BehaviorContext } from './behavior-context';

@Injectable()
export class BehaviorService {
  private delivering = false;
  constructor(
    @InjectRepository(BehaviorAction)
    private readonly actions: Repository<BehaviorAction>,
    private readonly trace: TraceService,
    private readonly config: ConfigService,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
  ) {}
  enabled() {
    return (
      this.config.get('OBB_NON_BUTTON_TRACKING_ENABLED') !== 'false' &&
      !!this.config.get('OBB_TRACE_TOPIC')
    );
  }
  async begin(context: BehaviorContext) {
    if (!this.enabled()) return false;
    await this.actions
      .createQueryBuilder()
      .insert()
      .values({
        id: context.action_id,
        userId: context.user_id,
        actionType: context.action_type,
        startedAt: new Date(context.action_started_at),
        originPlatform: context.origin_platform,
      })
      .orIgnore()
      .execute();
    const row = await this.actions.findOneBy({
      id: context.action_id,
      userId: context.user_id,
    });
    if (!row || row.actionType !== context.action_type) return false;
    context.action_started_at = row.startedAt.toISOString();
    context.origin_platform = row.originPlatform;
    return true;
  }
  async bind(context: BehaviorContext, resourceId?: string, fileId?: string) {
    if (!resourceId && !fileId) return;
    await this.actions.update(
      { id: context.action_id, userId: context.user_id },
      {
        ...(resourceId ? { resourceId } : {}),
        ...(fileId ? { fileId } : {}),
      },
    );
  }
  async result(
    context: BehaviorContext,
    status: 'success' | 'failed' | 'cancelled',
    at = new Date(),
  ) {
    await this.actions.update(
      {
        id: context.action_id,
        userId: context.user_id,
        status: status === 'success' ? Not('success') : 'pending',
      },
      { status, resultAt: at, emittedAt: null },
    );
    void this.deliver().catch(() => undefined);
  }
  /** Recover terminal parse outcomes even when the HTTP request or worker has gone away. */
  async reconcile() {
    const pending = await this.actions
      .createQueryBuilder('action')
      .where(
        "action.status <> 'success' AND action.actionType = 'resource_add'",
      )
      .andWhere(
        `EXISTS (SELECT 1 FROM tasks task WHERE task.payload->'behavior_context'->>'action_id' = action.id::text AND task.user_id = action.user_id AND (task.payload->>'behavior_postprocessed' = 'true' OR task.status IN ('error','timeout','insufficient_quota','canceled')))`,
      )
      .orderBy('action.updatedAt', 'ASC')
      .take(100)
      .getMany();
    for (const row of pending) {
      const tasks = await this.tasks
        .createQueryBuilder('task')
        .where("task.payload->'behavior_context'->>'action_id' = :id", {
          id: row.id,
        })
        .andWhere('task.userId = :user', { user: row.userId })
        .getMany();
      if (!tasks.length) continue;
      await this.actions.update(row.id, { updatedAt: new Date() });
      const terminal = tasks.filter(
        (task) => !tasks.some((next) => next.retriedFromTaskId === task.id),
      );
      const failed = terminal.some((task) =>
        [
          TaskStatus.ERROR,
          TaskStatus.TIMEOUT,
          TaskStatus.INSUFFICIENT_QUOTA,
          TaskStatus.CANCELED,
        ].includes(task.status),
      );
      const finished =
        terminal.length > 0 &&
        terminal.every(
          (task) =>
            task.status === TaskStatus.FINISHED &&
            task.payload?.behavior_postprocessed === true,
        );
      const parsed = terminal.some(
        (task) => task.payload?.behavior_parse_success === true,
      );
      if (failed || finished)
        await this.result(
          { action_id: row.id, user_id: row.userId } as BehaviorContext,
          failed || !parsed ? 'failed' : 'success',
        );
    }
  }
  /** Final-answer state is already durable; recover delivery after a process interruption. */
  async reconcileAnswers() {
    const rows: {
      id: string;
      user_id: string;
      status: string;
      completed_at: string;
    }[] = await this.actions.query(`
      SELECT DISTINCT ON (action.id) action.id, action.user_id,
        message.attrs->'answer_timing'->>'status' AS status,
        COALESCE(message.attrs->'answer_timing'->>'completed_at', message.updated_at::text) AS completed_at
      FROM behavior_actions action JOIN messages message
        ON message.attrs->>'behavior_action_id' = action.id::text AND message.user_id = action.user_id
      WHERE action.action_type = 'ai_conversation' AND action.status <> 'success'
        AND (action.status = 'pending' OR message.attrs->'answer_timing'->>'status' = 'complete')
        AND message.attrs->'answer_timing'->>'status' IN ('complete','failed','stopped')
      ORDER BY action.id, CASE WHEN message.attrs->'answer_timing'->>'status' = 'complete' THEN 0 ELSE 1 END, message.updated_at DESC
      LIMIT 100`);
    for (const row of rows) {
      await this.result(
        { action_id: row.id, user_id: row.user_id } as BehaviorContext,
        row.status === 'complete'
          ? 'success'
          : row.status === 'stopped'
            ? 'cancelled'
            : 'failed',
        new Date(row.completed_at),
      );
    }
  }
  /** Business state is durable before telemetry; all replicas reuse the same event identities. */
  @Interval(10_000)
  async deliver() {
    if (
      !this.enabled() ||
      this.delivering ||
      !this.config.get('OBB_TRACE_TOPIC')
    )
      return;
    this.delivering = true;
    try {
      await this.reconcile();
      await this.reconcileAnswers();
      const rows = await this.actions.find({
        where: { emittedAt: IsNull(), resultAt: Not(IsNull()) },
        order: { resultAt: 'ASC' },
        take: 100,
      });
      for (const row of rows) {
        const common = {
          schema_version: 1,
          action_id: row.id,
          action_type: row.actionType,
          action_started_at: row.startedAt.toISOString(),
          origin_platform: row.originPlatform,
        };
        await this.trace.emitTraceEvents(
          [
            {
              name: 'core_action_start',
              props: {
                ...common,
                event_id: row.id + ':start',
                occurred_at: row.startedAt.toISOString(),
              },
            },
            {
              name: 'core_action_result',
              props: {
                ...common,
                event_id: row.id + ':result:' + row.status,
                occurred_at: row.resultAt!.toISOString(),
                status: row.status,
                result_source: 'server',
              },
            },
          ],
          { userId: row.userId, platform: row.originPlatform },
        );
        await this.actions.update(
          {
            id: row.id,
            status: row.status,
            resultAt: row.resultAt!,
            emittedAt: IsNull(),
          },
          { emittedAt: new Date() },
        );
      }
    } finally {
      this.delivering = false;
    }
  }
}
