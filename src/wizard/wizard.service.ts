import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { Repository } from 'typeorm';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { CreateResourceDto } from 'omniboxd/resources/dto/create-resource.dto';
import { CollectRequestDto } from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omniboxd/wizard/dto/collect-response.dto';
import { User } from 'omniboxd/user/entities/user.entity';
import { TaskCallbackDto } from 'omniboxd/wizard/dto/task-callback.dto';
import { ConfigService } from '@nestjs/config';
import { CollectProcessor } from 'omniboxd/wizard/processors/collect.processor';
import { ReaderProcessor } from 'omniboxd/wizard/processors/reader.processor';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { StreamService } from 'omniboxd/wizard/stream.service';
import { WizardAPIService } from 'omniboxd/wizard/api.wizard.service';
import { ResourceType } from 'omniboxd/resources/resources.entity';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';

@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);
  private readonly processors: Record<string, Processor>;
  readonly streamService: StreamService;
  readonly wizardApiService: WizardAPIService;

  constructor(
    @InjectRepository(Task) private taskRepository: Repository<Task>,
    private readonly resourcesService: ResourcesService,
    private readonly messagesService: MessagesService,
    private readonly configService: ConfigService,
    private readonly attachmentsService: AttachmentsService,
  ) {
    this.processors = {
      collect: new CollectProcessor(resourcesService),
      file_reader: new ReaderProcessor(
        this.resourcesService,
        this.attachmentsService,
      ),
    };
    const baseUrl = this.configService.get<string>('OBB_WIZARD_BASE_URL');
    if (!baseUrl) {
      throw new Error('Environment variable OBB_WIZARD_BASE_URL is required');
    }
    this.streamService = new StreamService(
      baseUrl,
      this.messagesService,
      this.resourcesService,
    );
    this.wizardApiService = new WizardAPIService(baseUrl);
  }

  async create(partialTask: Partial<Task>) {
    const task = this.taskRepository.create(partialTask);
    return await this.taskRepository.save(task);
  }

  async collect(
    user: User,
    data: CollectRequestDto,
  ): Promise<CollectResponseDto> {
    const { html, url, title, namespace_id, parentId } = data;
    if (!namespace_id || !parentId || !url || !html) {
      throw new BadRequestException('Missing required fields');
    }

    const resourceDto: CreateResourceDto = {
      name: title || url,
      namespaceId: namespace_id,
      resourceType: ResourceType.LINK,
      parentId: parentId,
      attrs: { url },
    };
    const resource = await this.resourcesService.create(user, resourceDto);

    const payload = { resource_id: resource.id };

    const task = await this.create({
      function: 'collect',
      input: { html, url, title },
      namespaceId: namespace_id,
      payload,
      userId: user.id,
    });
    return { task_id: task.id, resource_id: resource.id };
  }

  async taskDoneCallback(data: TaskCallbackDto) {
    const task = await this.taskRepository.findOneOrFail({
      where: { id: data.id },
    });

    if (!task.startedAt) {
      throw new BadRequestException(
        `Task ${task.id} has not been started yet.`,
      );
    }

    task.endedAt = new Date();
    task.exception = data.exception;
    task.output = data.output;
    await this.taskRepository.save(task);

    const cost: number = task.endedAt.getTime() - task.startedAt.getTime();
    const wait: number = task.startedAt.getTime() - task.createdAt.getTime();
    this.logger.debug({ taskId: task.id, cost, wait });

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

  async fetchTask(): Promise<Task | null> {
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
        userId: queryResult[0].user_id,
        namespaceId: queryResult[0].namespace_id,
      });
      await this.taskRepository.save(task);
      return task;
    }

    return null;
  }
}
