import { Repository } from 'typeorm';
import { Task } from 'src/tasks/tasks.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { NamespacesService } from 'src/namespaces/namespaces.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    private readonly namespacesService: NamespacesService,
  ) {}

  async create(data: Partial<Task>) {
    const newTask = this.taskRepository.create(data);
    return await this.taskRepository.save(newTask);
  }

  async list(
    namespaceId: string,
    offset: number,
    limit: number,
  ): Promise<Task[]> {
    const namespace = await this.namespacesService.get(namespaceId);

    if (!namespace) {
      throw new NotFoundException('Namespace not found.');
    }

    return this.taskRepository.find({
      where: { namespace },
      relations: ['namespace'],
      skip: offset,
      take: limit,
    });
  }

  async get(taskId: string): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { task_id: taskId },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    return task;
  }

  async delete(taskId: string): Promise<void> {
    const task = await this.taskRepository.findOne({
      where: { task_id: taskId },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    await this.taskRepository.softRemove(task);
  }

  async handleCallback(taskData: Partial<Task>): Promise<void> {
    const task = await this.taskRepository.findOne({
      where: { task_id: taskData.task_id },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskData.task_id} not found`);
    }
    const newTask = this.taskRepository.create({
      ...task,
      ended_at: taskData.ended_at,
      exception: taskData.exception,
      output: taskData.output,
      updated_at: taskData.updated_at,
    });
    await this.taskRepository.save(newTask);
  }

  async fetch(): Promise<Task | null> {
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
      const newQuery = this.taskRepository.create(query);
      await this.taskRepository.save(newQuery);
    }

    return query;
  }
}
