import { Repository } from 'typeorm';
import { Task } from 'src/tasks/tasks.entity';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import { ResourcesService } from 'src/resources/resources.service';
import { CreateResourceDto } from 'src/resources/dto/create-resource.dto';
import { CollectRequestDto } from 'src/tasks/dto/collect-request.dto';
import { User } from 'src/user/user.entity';
import { TaskCallbackDto } from './dto/task-callback.dto';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    private readonly namespacesService: NamespacesService,
    private readonly resourcesService: ResourcesService, // inject ResourcesService
  ) {}

  async create(data: Partial<Task>) {
    const newTask = this.taskRepository.create(data);
    return await this.taskRepository.save(newTask);
  }

  async collect(user: User, data: CollectRequestDto) {
    const { html, url, title, namespace, spaceType } = data;
    if (!namespace || !spaceType || !url || !html) {
      throw new BadRequestException('Missing required fields');
    }
    const ns = await this.namespacesService.findByName(namespace);
    if (!ns) {
      throw new NotFoundException('Namespace not found');
    }

    // Actually create a resource using ResourcesService
    const resourceDto: CreateResourceDto = {
      name: title || url,
      namespace: ns.id,
      resourceType: 'link',
      spaceType,
      parentId: '',
      tags: [],
      content: 'Processing...',
      attrs: { url },
    };
    // You may need to provide a userId, here assumed as 0 or fetch from context if available
    const resource = await this.resourcesService.create(user.id, resourceDto);

    // Add resourceId to payload
    const payload = { spaceType, namespace, resourceId: resource.id };

    // Create a new task with function "collect"
    const task = this.taskRepository.create({
      function: 'collect',
      input: { html, url, title },
      namespace: ns,
      payload,
      user,
    });
    await this.taskRepository.save(task);
    return { taskId: task.id, resourceId: resource.id };
  }

  async taskDoneCallback(data: TaskCallbackDto) {
    const task = await this.taskRepository.findOne({
      where: { id: data.id },
      relations: ['namespace'],
    });
    if (!task) {
      throw new NotFoundException(`Task ${data.id} not found`);
    }

    const endedAt: Date = new Date(data.endedAt);

    task.endedAt = endedAt;
    task.exception = data.exception;
    task.output = data.output;
    await this.taskRepository.save(task);

    // Calculate cost and wait (if timestamps are present)
    const cost: number = task.endedAt.getTime() - task.startedAt.getTime();
    const wait: number = task.startedAt.getTime() - task.createdAt.getTime();
    console.debug(`Task ${task.id} cost: ${cost}ms, wait: ${wait}ms`);

    // Delegate postprocess logic to a separate method
    const postprocessResult = await this.postprocess(task);

    return { taskId: task.id, function: task.function, ...postprocessResult };
  }

  async postprocess(task: Task): Promise<Record<string, any>> {
    // Dispatch postprocess logic based on task.function
    if (task.function === 'collect') {
      return await this.postprocessCollect(task);
    }
    // Add more function types here as needed
    return {};
  }

  private async postprocessCollect(task: Task): Promise<Record<string, any>> {
    if (!task.payload?.resourceId) {
      throw new BadRequestException('Invalid task payload');
    }
    const resourceId = task.payload.resourceId;
    if (task.exception) {
      // If there was an exception, update resource content with error
      await this.resourcesService.update(resourceId, {
        namespace: task.namespace.id,
        content: task.exception.error,
      });
      return {};
    } else if (task.output) {
      // If successful, update resource with output
      const { markdown, title, ...attrs } = task.output || {};
      await this.resourcesService.update(resourceId, {
        namespace: task.namespace.id,
        name: title,
        content: markdown,
        attrs,
      });
      return { resourceId };
    }
    return {};
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

  async fetch(): Promise<Task | null> {
    const rawQuery = `
      WITH running_tasks_sub_query AS (SELECT namespace_id,
                                              COUNT(id) AS running_count
                                       FROM tasks
                                       WHERE started_at IS NOT NULL
                                         AND ended_at IS NULL
                                         AND canceled_at IS NULL
                                       GROUP BY namespace_id),
           id_subquery AS (SELECT tasks.id
                           FROM tasks
                                  LEFT OUTER JOIN running_tasks_sub_query
                                                  ON tasks.namespace_id = running_tasks_sub_query.namespace_id
                                  LEFT OUTER JOIN namespaces
                                                  ON tasks.namespace_id = namespaces.id
                           WHERE tasks.started_at IS NULL
                             AND tasks.canceled_at IS NULL
                             AND COALESCE(running_tasks_sub_query.running_count, 0) <
                                 COALESCE(namespaces.max_running_tasks, 0)
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
        user: { id: queryResult[0].user_id },
        namespace: { id: queryResult[0].namespace_id },
      });
      await this.taskRepository.save(task);
      return task;
    }

    return null;
  }
}
