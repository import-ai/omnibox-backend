import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, HttpStatus } from '@nestjs/common';
import { TaskDto, TaskMetaDto } from './dto/task.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { KafkaService } from 'omniboxd/kafka/kafka.service';
import { ConfigService } from '@nestjs/config';
import { Transaction } from 'omniboxd/utils/transaction-utils';
import { context, propagation } from '@opentelemetry/api';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { WizardCapabilitiesService } from 'omniboxd/tasks/wizard-capabilities.service';

@Injectable()
export class TasksService {
  private readonly kafkaTasksTopic: string;
  private readonly proUrl: string | undefined;

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly i18n: I18nService,
    private readonly kafkaService: KafkaService,
    private readonly configService: ConfigService,
    private readonly namespacesQuotaService: NamespacesQuotaService,
    private readonly wizardCapabilitiesService: WizardCapabilitiesService,
  ) {
    this.kafkaTasksTopic = this.configService.get<string>(
      'OBB_TASKS_TOPIC',
      'omnibox-tasks',
    );
    this.proUrl = this.configService.get<string>('OBB_PRO_URL');
  }

  injectTraceHeaders(task: Partial<Task>) {
    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);
    task.payload = { ...(task.payload || {}), trace_headers: traceHeaders };
    return task;
  }

  async checkTaskMessage(namespaceId: string): Promise<void> {
    const usage =
      await this.namespacesQuotaService.getNamespaceUsage(namespaceId);
    const topicName = `${this.kafkaTasksTopic}-${usage.taskPriority}`;
    while (true) {
      const task = await this.getNextTask(namespaceId);
      if (!task) {
        break;
      }
      const count = await this.countEnqueuedTasks(namespaceId);
      if (count >= usage.taskParallelism) {
        break;
      }
      const supported = await this.wizardCapabilitiesService.isSupported(
        task.function,
        task.input?.filename,
      );
      if (!supported) {
        await this.markTaskUnsupported(task);
        continue;
      }
      await this.produceTaskMessage(topicName, task, namespaceId);
      await this.setTaskEnqueued(namespaceId, task.id);
    }
  }

  private async markTaskUnsupported(task: Task): Promise<void> {
    await this.taskRepository.update(
      { id: task.id },
      {
        status: TaskStatus.ERROR,
        exception: {
          error: `Function '${task.function}' is not supported`,
          type: 'UnsupportedFunctionError',
        } as Record<string, any>,
        endedAt: new Date(),
      },
    );
  }

  async listActiveTaskNamespaceIds(): Promise<string[]> {
    const rows = await this.taskRepository
      .createQueryBuilder('task')
      .select('DISTINCT task.namespaceId', 'namespaceId')
      .where('task.status IN (:...statuses)', {
        statuses: [TaskStatus.PENDING, TaskStatus.RUNNING],
      })
      .getRawMany<{ namespaceId: string }>();
    return rows.map((row) => row.namespaceId);
  }

  async emitTask(data: Partial<Task>, tx?: Transaction) {
    const repo = tx?.entityManager.getRepository(Task) || this.taskRepository;
    const task = await repo.save(
      repo.create({
        ...this.injectTraceHeaders(data),
        resourceId: data.resourceId || data.payload?.resource_id,
      }),
    );
    if (tx) {
      tx.afterCommitHooks.push(() => this.checkTaskMessage(task.namespaceId));
    } else {
      await this.checkTaskMessage(task.namespaceId);
    }
    return task;
  }

  async countEnqueuedTasks(namespaceId: string): Promise<number> {
    return await this.taskRepository.count({
      where: {
        namespaceId,
        endedAt: IsNull(),
        canceledAt: IsNull(),
        enqueued: true,
      },
    });
  }

  async getNextTask(namespaceId: string): Promise<Task | null> {
    return await this.taskRepository.findOne({
      where: {
        namespaceId,
        endedAt: IsNull(),
        canceledAt: IsNull(),
        enqueued: false,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async setTaskEnqueued(namespaceId: string, taskId: string): Promise<void> {
    await this.taskRepository.update(
      { namespaceId, id: taskId },
      { enqueued: true },
    );
  }

  async listStaleEnqueuedTasks(minAgeMs = 60_000): Promise<Task[]> {
    const staleAt = new Date(Date.now() - minAgeMs);
    return await this.taskRepository.find({
      where: {
        enqueued: true,
        status: In([TaskStatus.PENDING, TaskStatus.RUNNING]),
        createdAt: LessThanOrEqual(staleAt),
      },
    });
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

  async reproduceTaskMessage(task: Task): Promise<void> {
    const supported = await this.wizardCapabilitiesService.isSupported(
      task.function,
      task.input?.filename,
    );
    if (!supported) {
      await this.markTaskUnsupported(task);
      return;
    }

    const usage = await this.namespacesQuotaService.getNamespaceUsage(
      task.namespaceId,
    );
    const topicName = `${this.kafkaTasksTopic}-${usage.taskPriority}`;
    await this.produceTaskMessage(topicName, task, task.namespaceId);
  }

  private async produceTaskMessage(
    topicName: string,
    task: Pick<Task, 'id' | 'function' | 'input'>,
    namespaceId: string,
  ): Promise<void> {
    await this.kafkaService.produce(topicName, [
      {
        value: JSON.stringify({
          task_id: task.id,
          namespace_id: namespaceId,
          function: task.function,
          meta: { file_name: task.input?.filename },
        }),
      },
    ]);
  }

  async cancelResourceTasks(
    namespaceId: string,
    resourceId: string,
    tx: Transaction,
  ) {
    if (!namespaceId || !resourceId) {
      return;
    }
    const tasksToCancel = await tx.entityManager.find(Task, {
      where: {
        namespaceId,
        resourceId,
        canceledAt: IsNull(),
        endedAt: IsNull(),
      },
      select: ['id'],
    });
    await tx.entityManager.update(
      Task,
      { namespaceId, resourceId, canceledAt: IsNull(), endedAt: IsNull() },
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

    const newTask = await this.emitTask({
      namespaceId: originalTask.namespaceId,
      userId: originalTask.userId,
      priority: originalTask.priority,
      function: originalTask.function,
      input: originalTask.input,
      payload: originalTask.payload,
    });

    return TaskDto.fromEntity(newTask);
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
