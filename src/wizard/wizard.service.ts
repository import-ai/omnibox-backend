import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { CreateResourceDto } from 'omniboxd/resources/dto/create-resource.dto';
import { CollectRequestDto } from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omniboxd/wizard/dto/collect-response.dto';
import { User } from 'omniboxd/user/entities/user.entity';
import { TaskCallbackDto } from 'omniboxd/wizard/dto/task-callback.dto';
import { ConfigService } from '@nestjs/config';
import { CollectProcessor } from 'omniboxd/wizard/processors/collect.processor';
import { ReaderProcessor } from 'omniboxd/wizard/processors/reader.processor';
import { ExtractTagsProcessor } from 'omniboxd/wizard/processors/extract-tags.processor';
import { GenerateTitleProcessor } from 'omniboxd/wizard/processors/generate-title.processor';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { StreamService } from 'omniboxd/wizard/stream.service';
import { WizardAPIService } from 'omniboxd/wizard/api.wizard.service';
import { ResourceType } from 'omniboxd/resources/resources.entity';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { Image, ProcessedImage } from 'omniboxd/wizard/types/wizard.types';

@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);
  private readonly processors: Record<string, Processor>;
  readonly streamService: StreamService;
  readonly wizardApiService: WizardAPIService;

  constructor(
    private readonly wizardTaskService: WizardTaskService,
    private readonly resourcesService: ResourcesService,
    private readonly tagService: TagService,
    private readonly messagesService: MessagesService,
    private readonly configService: ConfigService,
    private readonly attachmentsService: AttachmentsService,
  ) {
    this.processors = {
      collect: new CollectProcessor(resourcesService),
      file_reader: new ReaderProcessor(this.resourcesService),
      extract_tags: new ExtractTagsProcessor(resourcesService, this.tagService),
      generate_title: new GenerateTitleProcessor(resourcesService),
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
    return await this.wizardTaskService.create(partialTask);
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
    const resource = await this.resourcesService.create(user.id, resourceDto);

    const task = await this.wizardTaskService.createCollectTask(
      user.id,
      namespace_id,
      resource.id,
      { html, url, title },
    );
    return { task_id: task.id, resource_id: resource.id };
  }

  async taskDoneCallback(data: TaskCallbackDto) {
    const task = await this.wizardTaskService.taskRepository.findOneOrFail({
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

    await this.preprocessTask(task);

    await this.wizardTaskService.taskRepository.save(task);

    const cost: number = task.endedAt.getTime() - task.startedAt.getTime();
    const wait: number = task.startedAt.getTime() - task.createdAt.getTime();
    this.logger.debug({ taskId: task.id, cost, wait });

    if (task.canceledAt) {
      this.logger.warn(`Task ${task.id} was canceled.`);
      return { taskId: task.id, function: task.function, status: 'canceled' };
    }

    const postprocessResult = await this.postprocess(task);

    return { taskId: task.id, function: task.function, ...postprocessResult };
  }

  async postprocess(task: Task): Promise<Record<string, any>> {
    let result = {};

    if (task.function in this.processors) {
      const processor = this.processors[task.function];
      result = await processor.process(task);
    }

    // Trigger extract_tags after collect or file_reader tasks finish
    if (
      (task.function === 'collect' || task.function === 'file_reader') &&
      task.output?.markdown
    ) {
      await this.triggerExtractTags(task);
    }

    // Trigger generate_title after file_reader task finishes (only for open_api uploads)
    if (
      task.function === 'file_reader' &&
      task.output?.markdown &&
      task.payload?.source === 'open_api'
    ) {
      await this.triggerGenerateTitle(task);
    }

    return result;
  }

  private async triggerExtractTags(parentTask: Task): Promise<void> {
    try {
      const extractTagsTask =
        await this.wizardTaskService.createExtractTagsTask(parentTask);

      this.logger.debug(
        `Triggered extract_tags task ${extractTagsTask.id} for parent task ${parentTask.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to trigger extract_tags task for parent task ${parentTask.id}:`,
        error,
      );
    }
  }

  private async triggerGenerateTitle(parentTask: Task): Promise<void> {
    try {
      const generateTitleTask =
        await this.wizardTaskService.createGenerateTitleTask(
          parentTask.userId,
          parentTask.namespaceId,
          {
            resource_id:
              parentTask.payload?.resource_id || parentTask.payload?.resourceId,
            parent_task_id: parentTask.id,
          },
          { text: parentTask.output?.markdown },
        );

      this.logger.debug(
        `Triggered generate_title task ${generateTitleTask.id} for parent task ${parentTask.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to trigger generate_title task for parent task ${parentTask.id}:`,
        error,
      );
    }
  }

  /**
   * Preprocess task to handle images in output.
   * Converts base64 images to attachments and replaces them in task output.
   * @param task
   * @private
   */
  private async preprocessTask(task: Task): Promise<void> {
    if (!task.output?.images || !Array.isArray(task.output.images)) {
      return;
    }

    const images: Image[] = task.output.images;
    const processedImages: ProcessedImage[] = [];

    for (const image of images) {
      const stream = Buffer.from(image.data, 'base64');
      const resourceId = task.payload?.resource_id || task.payload?.resourceId;
      if (!resourceId) {
        throw new BadRequestException('Invalid task payload');
      }
      const attachmentId = await this.attachmentsService.uploadAttachment(
        task.namespaceId,
        resourceId,
        task.userId,
        image.name || image.link,
        stream,
        image.mimetype,
      );

      processedImages.push({
        originalLink: image.link,
        attachmentId,
        name: image.name,
        mimetype: image.mimetype,
      });
    }

    // Replace images with processed attachment info, keep markdown unchanged
    task.output.images = processedImages;
  }

  async fetchTask(): Promise<Task | null> {
    const rawQuery = `
      WITH running_tasks_sub_query AS (SELECT namespace_id,
                                              COUNT(id) AS running_count
                                       FROM tasks
                                       WHERE started_at IS NOT NULL
                                         AND ended_at IS NULL
                                         AND canceled_at IS NULL
                                         AND deleted_at IS NULL
                                       GROUP BY namespace_id),
           id_subquery AS (SELECT tasks.id
                           FROM tasks
                                  LEFT OUTER JOIN running_tasks_sub_query
                                                  ON tasks.namespace_id = running_tasks_sub_query.namespace_id
                                  LEFT OUTER JOIN namespaces
                                                  ON tasks.namespace_id = namespaces.id
                           WHERE tasks.started_at IS NULL
                             AND tasks.canceled_at IS NULL
                             AND tasks.deleted_at IS NULL
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

    const queryResult =
      await this.wizardTaskService.taskRepository.query(rawQuery);

    if (queryResult.length > 0) {
      const task = this.wizardTaskService.taskRepository.create({
        ...(queryResult[0] as Task),
        startedAt: new Date(),
        userId: queryResult[0].user_id,
        namespaceId: queryResult[0].namespace_id,
      });
      await this.wizardTaskService.taskRepository.save(task);
      return task;
    }

    return null;
  }
}
