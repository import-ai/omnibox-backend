import {
  BadRequestException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Task } from 'src/tasks/tasks.entity';
import { Repository } from 'typeorm';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import { ResourcesService } from 'src/resources/resources.service';
import { CreateResourceDto } from 'src/resources/dto/create-resource.dto';
import { CollectRequestDto } from 'src/wizard/dto/collect-request.dto';
import { User } from 'src/user/user.entity';
import { TaskCallbackDto } from 'src/wizard/dto/task-callback.dto';
import { Observable, Subscriber } from 'rxjs';

const wizardBaseUrl: string = 'http://localhost:8001';

abstract class Processor {
  abstract process(task: Task): Promise<Record<string, any>>;
}

class CollectProcessor extends Processor {
  constructor(private readonly resourcesService: ResourcesService) {
    super();
  }

  async process(task: Task): Promise<Record<string, any>> {
    if (!task.payload?.resourceId) {
      throw new BadRequestException('Invalid task payload');
    }
    const resourceId = task.payload.resourceId;
    if (task.exception) {
      await this.resourcesService.update(resourceId, {
        namespace: task.namespace.id,
        content: task.exception.error,
      });
      return {};
    } else if (task.output) {
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
}

@Injectable()
export class WizardService {
  private readonly processors: Record<string, Processor>;

  constructor(
    @InjectRepository(Task) private taskRepository: Repository<Task>,
    private readonly namespacesService: NamespacesService,
    private readonly resourcesService: ResourcesService,
  ) {
    this.processors = {
      collect: new CollectProcessor(resourcesService),
    };
  }

  async create(partialTask: Partial<Task>) {
    const task = this.taskRepository.create(partialTask);
    return await this.taskRepository.save(task);
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
    const resource = await this.resourcesService.create(user.id, resourceDto);
    console.debug({ resource });

    const payload = { spaceType, namespace, resourceId: resource.id };

    const task = await this.create({
      function: 'collect',
      input: { html, url, title },
      namespace: ns,
      payload,
      user,
    });
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

    task.endedAt = new Date(data.endedAt);
    task.exception = data.exception;
    task.output = data.output;
    await this.taskRepository.save(task);

    const cost: number = task.endedAt.getTime() - task.startedAt.getTime();
    const wait: number = task.startedAt.getTime() - task.createdAt.getTime();
    console.debug(`Task ${task.id} cost: ${cost}ms, wait: ${wait}ms`);

    const postprocessResult = await this.postprocess(task);

    return { taskId: task.id, function: task.function, ...postprocessResult };
  }

  async postprocess(task: Task): Promise<Record<string, any>> {
    if (task.function in this.processors) {
      const processor = this.processors[task.function];
      return await processor.process(task);
    }
    return {};
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
                             LIMIT 1)
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

  async fetchAndStream(
    subscriber: Subscriber<MessageEvent>,
    body: Record<string, any>,
  ) {
    const response = await fetch(`${wizardBaseUrl}/api/v1/grimoire/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw Error('Failed to fetch');
    }
    if (!response.body) {
      throw Error('No response body');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer: string = '';
    let i: number = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const sseResponse = decoder.decode(value);
      buffer += sseResponse;
      const chunks = buffer.split('\n\n');
      while (i < chunks.length - 1) {
        const chunk = chunks[i];
        if (chunk.startsWith('data:')) {
          const output = chunk.slice(5).trim();
          subscriber.next({ data: output });
        }
        i++;
      }
    }
    subscriber.complete();
  }

  chat(body: Record<string, any>): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      this.fetchAndStream(subscriber, body).catch((err) =>
        subscriber.error(err),
      );
    });
  }
}
