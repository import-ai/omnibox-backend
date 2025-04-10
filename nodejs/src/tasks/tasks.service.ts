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

  async listTasks(namespaceId: string, offset: number, limit: number): Promise<Task[]> {
    return this.taskRepository.find({
      where: { namespaceId },
      skip: offset,
      take: limit,
    });
  }

  async getTaskById(taskId: string): Promise<Task> {
    const task = await this.taskRepository.findOne({ where: { taskId } });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    return task;
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { taskId } });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    await this.taskRepository.softRemove(task);
  }

  async handleTaskCallback(taskData: Partial<Task>): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { taskId: taskData.taskId } });
    if (!task) {
      throw new NotFoundException(`Task ${taskData.taskId} not found`);
    }

    Object.assign(task, {
      updatedAt: taskData.updatedAt,
      endedAt: taskData.endedAt,
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
            .select('task.namespaceId', 'namespaceId')
            .addSelect('COUNT(task.taskId)', 'runningCount')
            .from(Task, 'task')
            .where('task.startedAt IS NOT NULL')
            .andWhere('task.endedAt IS NULL')
            .andWhere('task.canceledAt IS NULL')
            .groupBy('task.namespaceId'),
        'runningTasks',
        'task.namespaceId = runningTasks.namespaceId',
      )
      .where('task.startedAt IS NULL')
      .andWhere('task.canceledAt IS NULL')
      .andWhere('COALESCE(runningTasks.runningCount, 0) < task.concurrencyThreshold')
      .orderBy('task.priority', 'DESC')
      .addOrderBy('task.createdAt', 'ASC')
      .limit(1)
      .setLock('pessimistic_write')
      .getOne();

    if (query) {
      query.startedAt = new Date();
      await this.taskRepository.save(query);
    }

    return query;
  }
}
