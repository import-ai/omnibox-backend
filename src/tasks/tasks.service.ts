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

  async list(namespaceId: string, offset: number, limit: number) {
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

  async get(id: string) {
    const task = await this.taskRepository.findOne({
      where: { id },
    });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  async delete(id: string) {
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
    const rawQuery = `
      WITH running_tasks_sub_query AS (
        SELECT namespace_id,
               COUNT(id) AS running_count
        FROM tasks
        WHERE started_at IS NOT NULL
          AND ended_at IS NULL
          AND canceled_at IS NULL
        GROUP BY namespace_id
      ),
      id_subquery AS (
        SELECT tasks.id
        FROM tasks
                 LEFT OUTER JOIN running_tasks_sub_query
                 ON tasks.namespace_id = running_tasks_sub_query.namespace_id
                 LEFT OUTER JOIN namespaces
                 ON tasks.namespace_id = namespaces.id
        WHERE tasks.started_at IS NULL
          AND tasks.canceled_at IS NULL
          AND COALESCE(running_tasks_sub_query.running_count, 0) < COALESCE(namespaces.max_running_tasks, 0)
        ORDER BY priority DESC,
                 tasks.created_at
        LIMIT 1
      )
      SELECT *
      FROM tasks
      WHERE id IN (SELECT id FROM id_subquery)
      FOR UPDATE SKIP LOCKED;
    `;

    const queryResult = await this.taskRepository.query(rawQuery);

    if (queryResult.length > 0) {
      const task = this.taskRepository.create({
        ...(queryResult[0] as Task),
        startedAt: new Date(),
      });
      await this.taskRepository.save(task);
      return task;
    }

    return null;
  }
}
