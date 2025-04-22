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

  async list(namespaceId: number, offset: number, limit: number) {
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

  async get(id: number) {
    const task = await this.taskRepository.findOne({
      where: { id },
    });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  async delete(id: number) {
    const task = await this.taskRepository.findOne({
      where: { id },
    });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    await this.taskRepository.softRemove(task);
  }

  async handleCallback(taskData: Partial<Task>) {
    const task = await this.taskRepository.findOne({
      where: { id: taskData.id },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskData.id} not found`);
    }
    const newTask = this.taskRepository.create({
      ...task,
      endedAt: taskData.endedAt,
      exception: taskData.exception,
      output: taskData.output,
      updatedAt: taskData.updatedAt,
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
      query.startedAt = new Date();
      const newQuery = this.taskRepository.create(query);
      await this.taskRepository.save(newQuery);
    }

    return query;
  }
}
