import { BadRequestException, Injectable, MessageEvent } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Task } from 'src/tasks/tasks.entity';
import { Repository } from 'typeorm';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import { ResourcesService } from 'src/resources/resources.service';
import { CreateResourceDto } from 'src/resources/dto/create-resource.dto';
import { CollectRequestDto } from 'src/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'src/wizard/dto/collect-response.dto';
import { User } from 'src/user/user.entity';
import { TaskCallbackDto } from 'src/wizard/dto/task-callback.dto';
import { Observable, Subscriber } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { CollectProcessor } from 'src/wizard/processors/collect.processor';
import { ReaderProcessor } from 'src/wizard/processors/reader.processor';
import { Processor } from 'src/wizard/processors/processor.abstract';

@Injectable()
export class WizardService {
  private readonly processors: Record<string, Processor>;
  private readonly wizardBaseUrl: string;

  constructor(
    @InjectRepository(Task) private taskRepository: Repository<Task>,
    private readonly namespacesService: NamespacesService,
    private readonly resourcesService: ResourcesService,
    private readonly configService: ConfigService,
  ) {
    this.processors = {
      collect: new CollectProcessor(resourcesService),
      file_reader: new ReaderProcessor(resourcesService),
    };
    const baseUrl = this.configService.get<string>('OBB_WIZARD_BASE_URL');
    if (!baseUrl) {
      throw new Error('Environment variable OBB_WIZARD_BASE_URL is required');
    }
    this.wizardBaseUrl = baseUrl;
  }

  async create(partialTask: Partial<Task>) {
    const task = this.taskRepository.create(partialTask);
    return await this.taskRepository.save(task);
  }

  async collect(
    user: User,
    data: CollectRequestDto,
  ): Promise<CollectResponseDto> {
    const { html, url, title, namespace_id, space_type } = data;
    if (!namespace_id || !space_type || !url || !html) {
      throw new BadRequestException('Missing required fields');
    }
    const namespace = await this.namespacesService.get(namespace_id);

    const resourceRoot = await this.resourcesService.getRoot(
      namespace.id,
      space_type,
      user.id,
    );

    const resourceDto: CreateResourceDto = {
      name: title || url,
      namespaceId: namespace.id,
      resourceType: 'link',
      parentId: resourceRoot.id,
      attrs: { url },
    };
    const resource = await this.resourcesService.create(user, resourceDto);
    console.debug({ resource });

    const payload = { resourceId: resource.id };

    const task = await this.create({
      function: 'collect',
      input: { html, url, title },
      namespace: namespace,
      payload,
      user,
    });
    return { task_id: task.id, resource_id: resource.id };
  }

  async taskDoneCallback(data: TaskCallbackDto) {
    const task = await this.taskRepository.findOneOrFail({
      where: { id: data.id },
      relations: ['namespace', 'user'],
    });

    task.endedAt = new Date();
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
    const response = await fetch(
      `${this.wizardBaseUrl}/api/v1/grimoire/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
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
