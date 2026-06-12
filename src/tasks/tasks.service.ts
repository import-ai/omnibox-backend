import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { context, propagation } from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { S3Service } from 'omniboxd/s3/s3.service';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { numberToBigintString } from 'omniboxd/utils/bigint-utils';
import { Transaction } from 'omniboxd/utils/transaction-utils';
import { In, IsNull, Repository } from 'typeorm';
import { gzipSync } from 'zlib';

import { TaskDto, TaskMetaDto } from './dto/task.dto';

@Injectable()
export class TasksService {
  private readonly proUrl: string | undefined;
  private readonly gzipHtmlFolder: string = 'collect/html/gzip';

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly i18n: I18nService,
    private readonly configService: ConfigService,
    private readonly namespacesQuotaService: NamespacesQuotaService,
    private readonly s3Service: S3Service,
  ) {
    this.proUrl = this.configService.get<string>('OBB_PRO_URL');
  }

  async uploadHtmlToS3(html: string): Promise<string> {
    const { objectKey } = await this.s3Service.generateObjectKey(
      this.gzipHtmlFolder,
      'html.gz',
    );
    await this.s3Service.putObject(
      objectKey,
      gzipSync(Buffer.from(html, 'utf-8')),
      'application/gzip',
    );
    return objectKey;
  }

  injectTraceHeaders(task: Partial<Task>) {
    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);
    task.payload = { ...(task.payload || {}), trace_headers: traceHeaders };
    return task;
  }

  getHtmlS3Key(input: Record<string, any>): string | undefined {
    if (input.html_s3_key) {
      return input.html_s3_key;
    }
    // Backward compatibility: old tasks stored the S3 key directly in html
    if (
      typeof input.html === 'string' &&
      input.html.startsWith(this.gzipHtmlFolder) &&
      input.html.length === this.gzipHtmlFolder.length + 36 // 1 + 32 + 3
    ) {
      return input.html;
    }
    return undefined;
  }

  async emitTask(data: Partial<Task>, tx?: Transaction) {
    const repo = tx?.entityManager.getRepository(Task) || this.taskRepository;
    let priority = data.priority;
    if (priority === undefined && data.namespaceId) {
      const usage = await this.namespacesQuotaService.getNamespaceUsage(
        data.namespaceId,
      );
      priority = numberToBigintString(usage.taskPriority);
    }
    return await repo.save(
      repo.create({
        ...this.injectTraceHeaders(data),
        priority,
        resourceId: data.resourceId || data.payload?.resource_id,
      }),
    );
  }

  async findOldestPendingOrRunningTask(): Promise<Task | null> {
    return await this.taskRepository.findOne({
      where: {
        status: In([TaskStatus.PENDING, TaskStatus.RUNNING]),
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async cancelResourceTasks(
    namespaceId: string,
    resourceIds: string | string[],
    tx: Transaction,
  ) {
    const ids = Array.isArray(resourceIds) ? resourceIds : [resourceIds];
    if (!namespaceId || ids.length === 0) {
      return;
    }
    const tasksToCancel = await tx.entityManager.find(Task, {
      where: {
        namespaceId,
        resourceId: In(ids),
        canceledAt: IsNull(),
        endedAt: IsNull(),
      },
      select: ['id'],
    });
    await tx.entityManager.update(
      Task,
      {
        namespaceId,
        resourceId: In(ids),
        canceledAt: IsNull(),
        endedAt: IsNull(),
      },
      { canceledAt: new Date(), status: TaskStatus.CANCELED },
    );
    for (const task of tasksToCancel) {
      tx.afterCommitHooks.push(() => this.callTaskHook(namespaceId, task.id));
    }
  }

  async cancelUserTasks(
    namespaceId: string,
    userId: string,
    tx: Transaction,
  ): Promise<void> {
    if (!namespaceId || !userId) {
      return;
    }
    await tx.entityManager.update(
      Task,
      { namespaceId, userId, canceledAt: IsNull(), endedAt: IsNull() },
      { canceledAt: new Date() },
    );
  }

  async list(
    namespaceId: string,
    offset: number,
    limit: number,
    userId?: string,
  ): Promise<{ tasks: TaskMetaDto[]; total: number }> {
    const where: any = { namespaceId };
    if (userId) {
      where.userId = userId;
    }

    const [tasks, total] = await this.taskRepository.findAndCount({
      where,
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      tasks: tasks.map((task) => TaskMetaDto.fromEntity(task)),
      total,
    };
  }

  async get(id: string) {
    const task = await this.taskRepository.findOne({
      where: { id },
    });
    if (!task) {
      const message = this.i18n.t('task.errors.taskNotFound', { args: { id } });
      throw new AppException(message, 'TASK_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return task;
  }

  async delete(id: string) {
    const task = await this.taskRepository.findOne({
      where: { id },
    });
    if (!task) {
      const message = this.i18n.t('task.errors.taskNotFound', { args: { id } });
      throw new AppException(message, 'TASK_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.taskRepository.softRemove(task);
  }

  async cancelTaskOrFail(id: string): Promise<TaskDto> {
    const task = await this.get(id);

    if (task.canceledAt) {
      const message = this.i18n.t('task.errors.taskAlreadyCanceled');
      throw new AppException(
        message,
        'TASK_ALREADY_CANCELED',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (task.endedAt) {
      const message = this.i18n.t('task.errors.cannotCancelFinished');
      throw new AppException(
        message,
        'CANNOT_CANCEL_FINISHED',
        HttpStatus.BAD_REQUEST,
      );
    }

    task.canceledAt = new Date();
    task.status = TaskStatus.CANCELED;
    const updatedTask = await this.taskRepository.save(task);
    await this.callTaskHook(task.namespaceId, task.id);

    return TaskDto.fromEntity(updatedTask);
  }

  async callTaskHook(namespaceId: string, taskId: string): Promise<void> {
    if (!this.proUrl) {
      return;
    }
    const url = `${this.proUrl}/internal/api/v1/namespaces/${namespaceId}/tasks/${taskId}/hook`;
    const response = await fetch(url, {
      method: 'POST',
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new AppException(
        data.message ?? `Pro API error: ${response.statusText}`,
        data.code ?? 'PRO_TASK_HOOK_FAILED',
        response.status as HttpStatus,
      );
    }
  }

  async rerunTask(id: string): Promise<TaskDto> {
    const originalTask = await this.get(id);

    if (!originalTask.canceledAt) {
      const message = this.i18n.t('task.errors.canOnlyRerunCanceled');
      throw new AppException(
        message,
        'CAN_ONLY_RERUN_CANCELED',
        HttpStatus.BAD_REQUEST,
      );
    }

    let input = originalTask.input;
    if (typeof input?.html === 'string') {
      const { html, ...rest } = input;
      const html_s3_key =
        this.getHtmlS3Key(input) ?? (await this.uploadHtmlToS3(html));
      input = { ...rest, html_s3_key };
    }
    const newTask = await this.emitTask({
      namespaceId: originalTask.namespaceId,
      userId: originalTask.userId,
      priority: originalTask.priority,
      function: originalTask.function,
      input,
      payload: originalTask.payload,
    });

    return TaskDto.fromEntity(newTask);
  }

  async getNextTaskV2(
    functions: string[],
    heartbeatCutoff: Date,
  ): Promise<Task | null> {
    if (functions.length === 0) {
      return null;
    }

    const limitedNamespaces =
      await this.listNamespacesAtParallelismLimit(heartbeatCutoff);
    const seed = randomUUID();

    const qb = this.taskRepository
      .createQueryBuilder('task')
      .where('task.status IN (:...statuses)', {
        statuses: [TaskStatus.PENDING, TaskStatus.RUNNING],
      })
      .andWhere(
        '(task.lastHeartbeat IS NULL OR task.lastHeartbeat < :heartbeatCutoff)',
        { heartbeatCutoff },
      )
      .andWhere('task.function IN (:...functions)', { functions });

    if (limitedNamespaces.length > 0) {
      qb.andWhere('task.namespaceId NOT IN (:...limitedNamespaces)', {
        limitedNamespaces,
      });
    }

    // Order by priority, then a per-namespace hash so the selection is spread
    // evenly across namespaces instead of always favoring the same one. The
    // seed re-randomizes the hash each call.
    //
    // Priority is normally highest first, but with a 1/5 chance we flip to
    // lowest first so low-priority tasks aren't starved.
    const priorityOrder = Math.random() < 0.2 ? 'ASC' : 'DESC';
    return await qb
      .orderBy('task.priority', priorityOrder)
      .addOrderBy('md5(task.namespaceId || :seed)', 'ASC')
      .addOrderBy('task.createdAt', 'ASC')
      .setParameter('seed', seed)
      .limit(1)
      .getOne();
  }

  /**
   * Atomically claim a task for execution. The conditional WHERE guards against
   * two workers grabbing the same task: only a pending/running task whose
   * heartbeat is missing or stale (older than 10s) can be claimed. Returns the
   * claimed task, or null if another worker won the race.
   */
  async claimTask(taskId: string, heartbeatCutoff: Date): Promise<Task | null> {
    const now = new Date();
    const result = await this.taskRepository
      .createQueryBuilder()
      .update(Task)
      .set({ status: TaskStatus.RUNNING, startedAt: now, lastHeartbeat: now })
      .where('id = :taskId', { taskId })
      .andWhere('status IN (:...statuses)', {
        statuses: [TaskStatus.PENDING, TaskStatus.RUNNING],
      })
      .andWhere(
        '(last_heartbeat IS NULL OR last_heartbeat < :heartbeatCutoff)',
        { heartbeatCutoff },
      )
      .execute();
    if (!result.affected) {
      return null;
    }
    return await this.taskRepository.findOne({ where: { id: taskId } });
  }

  async listNamespacesAtParallelismLimit(
    heartbeatCutoff: Date,
  ): Promise<string[]> {
    const rows = await this.taskRepository
      .createQueryBuilder('task')
      .select('task.namespaceId', 'namespaceId')
      .addSelect('COUNT(*)', 'count')
      .where('task.status = :status', { status: TaskStatus.RUNNING })
      .andWhere('task.lastHeartbeat >= :heartbeatCutoff', { heartbeatCutoff })
      .groupBy('task.namespaceId')
      .getRawMany<{ namespaceId: string; count: string }>();

    if (rows.length === 0) {
      return [];
    }

    const parallelismMap =
      await this.namespacesQuotaService.batchGetNamespaceParallelism(
        rows.map((r) => r.namespaceId),
      );

    return rows
      .filter((r) => Number(r.count) >= (parallelismMap[r.namespaceId] ?? 1))
      .map((r) => r.namespaceId);
  }

  async updateHeartbeat(taskId: string): Promise<void> {
    await this.taskRepository.update(
      { id: taskId, status: TaskStatus.RUNNING },
      { lastHeartbeat: new Date() },
    );
  }

  async getTasksByResourceId(
    namespaceId: string,
    resourceId: string,
  ): Promise<TaskMetaDto[]> {
    const tasks = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.namespaceId = :namespaceId', { namespaceId })
      .andWhere("task.payload->>'resource_id' = :resourceId", { resourceId })
      .orderBy('task.createdAt', 'DESC')
      .getMany();

    return tasks.map((task) => TaskMetaDto.fromEntity(task));
  }
}
