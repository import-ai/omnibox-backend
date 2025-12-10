import { IsNull, Repository } from 'typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, HttpStatus } from '@nestjs/common';
import { TaskDto, TaskMetaDto } from './dto/task.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { KafkaService } from 'omniboxd/kafka/kafka.service';
import { ConfigService } from '@nestjs/config';
import { Transaction } from 'omniboxd/utils/transaction-utils';
import { context, propagation } from '@opentelemetry/api';

@Injectable()
export class TasksService {
  private readonly kafkaTasksTopic: string;

  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    private readonly i18n: I18nService,
    private readonly kafkaService: KafkaService,
    private readonly configService: ConfigService,
  ) {
    this.kafkaTasksTopic = this.configService.get<string>(
      'OBB_TASKS_TOPIC',
      'omnibox-tasks',
    );
  }

  injectTraceHeaders(task: Partial<Task>) {
    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);
    task.payload = { ...(task.payload || {}), trace_headers: traceHeaders };
    return task;
  }

  async checkTaskMessage(namespaceId: string): Promise<void> {
    const numTasks = await this.countEnqueuedTasks(namespaceId);
    if (numTasks > 1) {
      return;
    }
    const task = await this.getNextTask(namespaceId);
    if (!task) {
      return;
    }
    await this.kafkaService.produce(this.kafkaTasksTopic, [
      {
        key: namespaceId,
        value: JSON.stringify({
          task_id: task.id,
          namespace_id: namespaceId,
          function: task.function,
          meta: { file_name: task.input?.filename },
        }),
      },
    ]);
    await this.setTaskEnqueued(namespaceId, task.id);
  }

  async emitTask(data: Partial<Task>, tx?: Transaction) {
    const repo = tx?.entityManager.getRepository(Task) || this.taskRepository;
    const task = await repo.save(repo.create(this.injectTraceHeaders(data)));
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

  async cancelTask(id: string): Promise<TaskDto> {
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
    const updatedTask = await this.taskRepository.save(task);

    return TaskDto.fromEntity(updatedTask);
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
