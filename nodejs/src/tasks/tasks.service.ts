import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './tasks.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
  ) {}

  async createTask(data: Partial<Task>): Promise<Task> {
    const task = this.taskRepository.create(data);
    return this.taskRepository.save(task);
  }

  async listTasks(
    namespaceId: string,
    offset: number,
    limit: number,
  ): Promise<Task[]> {
    return this.taskRepository.find({
      where: { namespace_id: namespaceId },
      skip: offset,
      take: limit,
    });
  }

  async getTaskById(taskId: string): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { task_id: taskId },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    return task;
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = await this.taskRepository.findOne({
      where: { task_id: taskId },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    await this.taskRepository.softRemove(task);
  }

  async handleTaskCallback(taskData: Partial<Task>): Promise<void> {
    const task = await this.taskRepository.findOne({
      where: { task_id: taskData.task_id },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskData.task_id} not found`);
    }

    Object.assign(task, {
      updatedAt: taskData.updated_at,
      endedAt: taskData.ended_at,
      exception: taskData.exception,
      output: taskData.output,
    });

    await this.taskRepository.save(task);
  }

  async fetchTask(): Promise<Task | null> {
    const query = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect(
        (qb) =>
          qb
            .select('task.namespace_id', 'namespace_id')
            .addSelect('COUNT(task.task_id)', 'running_count')
            .from(Task, 'task')
            .where('task.started_at IS NOT NULL')
            .andWhere('task.ended_at IS NULL')
            .andWhere('task.canceled_at IS NULL')
            .groupBy('task.namespace_id'),
        'runningTasks',
        'task.namespace_id = runningTasks.namespace_id',
      )
      .where('task.started_at IS NULL')
      .andWhere('task.canceled_at IS NULL')
      .andWhere(
        'COALESCE(runningTasks.running_count, 0) < task.concurrency_threshold',
      )
      .orderBy('task.priority', 'DESC')
      .addOrderBy('task.created_at', 'ASC')
      .limit(1)
      .setLock('pessimistic_write')
      .getOne();

    if (query) {
      query.started_at = new Date();
      await this.taskRepository.save(query);
    }

    return query;
  }
}
