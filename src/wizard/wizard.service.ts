import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import { CompressedCollectRequestDto } from 'omniboxd/wizard/dto/collect-request.dto';
import {
  NextTaskRequestDto,
  TaskCallbackDto,
} from 'omniboxd/wizard/dto/task-callback.dto';
import { ConfigService } from '@nestjs/config';
import { CollectProcessor } from 'omniboxd/wizard/processors/collect.processor';
import { ReaderProcessor } from 'omniboxd/wizard/processors/reader.processor';
import { ExtractTagsProcessor } from 'omniboxd/wizard/processors/extract-tags.processor';
import { GenerateTitleProcessor } from 'omniboxd/wizard/processors/generate-title.processor';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { StreamService } from 'omniboxd/wizard/stream.service';
import { WizardAPIService } from 'omniboxd/wizard/api.wizard.service';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { Image, ProcessedImage } from 'omniboxd/wizard/types/wizard.types';
import { InternalTaskDto } from 'omniboxd/tasks/dto/task.dto';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { S3Service } from 'omniboxd/s3/s3.service';
import { createGunzip } from 'zlib';
import { buffer } from 'node:stream/consumers';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { TempfileDto } from './dto/tempfile.dto';

@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);
  private readonly processors: Record<string, Processor>;
  readonly streamService: StreamService;
  readonly wizardApiService: WizardAPIService;
  private readonly videoPrefixes: string[];

  private readonly gzipHtmlFolder: string = 'collect/html/gzip';

  constructor(
    private readonly wizardTaskService: WizardTaskService,
    private readonly tasksService: TasksService,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly tagService: TagService,
    private readonly messagesService: MessagesService,
    private readonly configService: ConfigService,
    private readonly attachmentsService: AttachmentsService,
    private readonly s3Service: S3Service,
    private readonly sharedResourcesService: SharedResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly i18n: I18nService,
  ) {
    this.processors = {
      collect: new CollectProcessor(
        this.namespaceResourcesService,
        this.resourcesService,
        this.tagService,
        this.i18n,
      ),
      file_reader: new ReaderProcessor(
        this.namespaceResourcesService,
        this.resourcesService,
        this.tagService,
        this.i18n,
      ),
      extract_tags: new ExtractTagsProcessor(
        namespaceResourcesService,
        this.tagService,
        this.i18n,
      ),
      generate_title: new GenerateTitleProcessor(
        namespaceResourcesService,
        this.i18n,
      ),
      generate_video_note: new CollectProcessor(
        this.namespaceResourcesService,
        this.resourcesService,
        this.tagService,
        this.i18n,
      ),
    };
    const baseUrl = this.configService.get<string>('OBB_WIZARD_BASE_URL');
    if (!baseUrl) {
      const message = this.i18n.t('system.errors.missingWizardBaseUrl');
      throw new AppException(
        message,
        'MISSING_WIZARD_BASE_URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.streamService = new StreamService(
      baseUrl,
      this.messagesService,
      this.namespaceResourcesService,
      this.sharedResourcesService,
      this.resourcesService,
      this.i18n,
    );
    this.wizardApiService = new WizardAPIService(baseUrl, this.i18n);
    const videoPrefixes: string =
      this.configService.get<string>('OB_VIDEO_PREFIXES') || '';
    if (isEmpty(videoPrefixes)) {
      this.videoPrefixes = [];
    } else {
      this.videoPrefixes = videoPrefixes
        .split(',')
        .map((prefix) => prefix.trim());
    }
  }

  isVideoUrl(url: string): boolean {
    for (const prefix of this.videoPrefixes) {
      if (url.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  async compressedCollect(
    namespaceId: string,
    userId: string,
    data: CompressedCollectRequestDto,
    compressedHtml: Express.Multer.File,
  ) {
    if (!compressedHtml) {
      const message = this.i18n.t('wizard.errors.missingFile');
      throw new AppException(message, 'MISSING_FILE', HttpStatus.BAD_REQUEST);
    }
    const { url, title, parentId } = data;
    if (!namespaceId || !parentId || !url) {
      const message = this.i18n.t('wizard.errors.missingRequiredFields');
      throw new AppException(
        message,
        'MISSING_REQUIRED_FIELDS',
        HttpStatus.BAD_REQUEST,
      );
    }

    const resourceDto: CreateResourceDto = {
      name: title || url,
      resourceType: ResourceType.LINK,
      parentId: parentId,
      attrs: { url },
    };
    const resource = await this.namespaceResourcesService.create(
      userId,
      namespaceId,
      resourceDto,
    );

    const { objectKey } = await this.s3Service.generateObjectKey(
      this.gzipHtmlFolder,
      'html.gz',
    );
    const metadata = {
      resourceId: resource.id,
      url,
    };
    await this.s3Service.putObject(
      objectKey,
      compressedHtml.buffer,
      compressedHtml.mimetype,
      metadata,
    );

    if (this.isVideoUrl(url)) {
      const task = await this.wizardTaskService.emitGenerateVideoNoteTask(
        userId,
        namespaceId,
        resource.id,
        { html: objectKey, url, title },
      );
      return { task_id: task.id, resource_id: resource.id };
    } else {
      const task = await this.wizardTaskService.emitCollectTask(
        userId,
        namespaceId,
        resource.id,
        { html: objectKey, url, title },
      );
      return { task_id: task.id, resource_id: resource.id };
    }
  }

  /**
   * Collect content from a URL using the crawl service.
   * Creates a collect_url task that will:
   * 1. Fetch title and HTML from the crawl service
   * 2. Create a collect task via the task chain dispatch system
   */
  async collectUrl(
    namespaceId: string,
    userId: string,
    url: string,
    parentId: string,
  ): Promise<{ resource_id: string }> {
    if (!namespaceId || !parentId || !url) {
      const message = this.i18n.t('wizard.errors.missingRequiredFields');
      throw new AppException(
        message,
        'MISSING_REQUIRED_FIELDS',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Create a placeholder resource for the URL
    const resourceDto: CreateResourceDto = {
      name: url,
      resourceType: ResourceType.LINK,
      parentId,
      attrs: { url },
    };
    const resource = await this.namespaceResourcesService.create(
      userId,
      namespaceId,
      resourceDto,
    );

    // Create a collect_url task that will fetch HTML and create a collect task
    await this.tasksService.emitTask({
      function: 'collect_url',
      input: { url },
      namespaceId,
      payload: { resource_id: resource.id },
      userId,
    });

    return { resource_id: resource.id };
  }

  async createTaskUploadUrl(taskId: string): Promise<string> {
    return await this.s3Service.generateUploadUrl(
      `wizard-tasks/${taskId}`,
      false,
    );
  }

  async createTempfile(filename?: string): Promise<TempfileDto> {
    const { objectKey } = await this.s3Service.generateObjectKey(
      'wizard-tempfiles',
      filename,
    );
    const uploadUrl = await this.s3Service.generateUploadUrl(objectKey, false);
    const downloadUrl = await this.s3Service.generateDownloadUrl(
      objectKey,
      true,
    );
    return { uploadUrl, downloadUrl };
  }

  async uploadedTaskDoneCallback(taskId: string) {
    const key = `wizard-tasks/${taskId}`;
    const { stream } = await this.s3Service.getObject(key);
    const payload = await buffer(stream);
    const taskCallback: TaskCallbackDto = JSON.parse(payload.toString('utf-8'));
    const result = await this.taskDoneCallback(taskCallback);
    await this.s3Service.deleteObject(key);
    return result;
  }

  async taskDoneCallback(data: TaskCallbackDto) {
    const task = await this.wizardTaskService.taskRepository.findOneOrFail({
      where: { id: data.id },
    });
    try {
      if (!task.startedAt) {
        const message = this.i18n.t('wizard.errors.taskNotStarted', {
          args: { taskId: task.id },
        });
        throw new AppException(
          message,
          'TASK_NOT_STARTED',
          HttpStatus.BAD_REQUEST,
        );
      }

      task.endedAt = new Date();
      task.exception = data.exception || null;

      // Extract next_tasks from output before saving (task chain dispatch)
      const nextTasks: NextTaskRequestDto[] = data.output?.next_tasks || [];
      if (data.output) {
        // Save output without next_tasks
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { next_tasks, ...outputWithoutNextTasks } = data.output;
        task.output = outputWithoutNextTasks;
      } else {
        task.output = null;
      }

      await this.preprocessTask(task);

      if (data.status) {
        task.status = data.status;
      } else if (!isEmpty(task.exception)) {
        task.status = TaskStatus.ERROR;
      } else {
        task.status = TaskStatus.FINISHED;
      }

      await this.wizardTaskService.taskRepository.save(task);

      const cost: number = task.endedAt.getTime() - task.startedAt.getTime();
      const wait: number = task.startedAt.getTime() - task.createdAt.getTime();
      this.logger.debug({ taskId: task.id, cost, wait });

      if (task.canceledAt) {
        this.logger.warn(`Task ${task.id} was canceled.`);
        return { taskId: task.id, function: task.function, status: 'canceled' };
      }

      const postprocessResult = await this.postprocess(task);

      if (task.status === TaskStatus.FINISHED && nextTasks.length > 0) {
        await this.dispatchNextTasks(task, nextTasks);
      }

      return { taskId: task.id, function: task.function, ...postprocessResult };
    } finally {
      await this.tasksService.checkTaskMessage(task.namespaceId);
    }
  }

  private async dispatchNextTasks(
    parentTask: Task,
    nextTasks: NextTaskRequestDto[],
  ): Promise<void> {
    for (const nextTask of nextTasks) {
      try {
        const createdTask = await this.tasksService.emitTask({
          namespaceId: parentTask.namespaceId,
          userId: parentTask.userId,
          priority: nextTask.priority ?? parentTask.priority,
          function: nextTask.function,
          input: nextTask.input,
          payload: {
            ...nextTask.payload,
            parent_task_id: parentTask.id,
          },
        });
        this.logger.debug({
          parentTaskId: parentTask.id,
          parentTaskFunction: parentTask.function,
          nextTaskId: createdTask.id,
          nextTaskFunction: nextTask.function,
        });
      } catch (error) {
        this.logger.error({
          parentTaskId: parentTask.id,
          parentTaskFunction: parentTask.function,
          nextTaskFunction: nextTask.function,
          error,
        });
      }
    }
  }

  async postprocess(task: Task): Promise<Record<string, any>> {
    let result: Record<string, any> = {};

    if (task.function in this.processors) {
      const processor = this.processors[task.function];
      result = await processor.process(task);
    }
    return result;
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
        const message = this.i18n.t('wizard.errors.invalidTaskPayload');
        throw new AppException(
          message,
          'INVALID_TASK_PAYLOAD',
          HttpStatus.BAD_REQUEST,
        );
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

  async startTask(taskId: string): Promise<InternalTaskDto> {
    const task = await this.wizardTaskService.taskRepository.findOne({
      where: { id: taskId },
    });
    if (!task) {
      throw new AppException(
        `Task ${taskId} not found`,
        'TASK_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.tasksService.checkTaskMessage(task.namespaceId);

    if (task.canceledAt) {
      throw new AppException(
        `Task ${taskId} has been canceled`,
        'TASK_CANCELED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (task.endedAt) {
      throw new AppException(
        `Task ${taskId} has already ended`,
        'TASK_ENDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    task.startedAt = new Date();
    task.status = TaskStatus.RUNNING;
    const newTask = await this.wizardTaskService.taskRepository.save(task);
    // Fetch HTML content from S3 for collect tasks
    if (
      ['collect', 'generate_video_note'].includes(newTask.function) &&
      newTask.input.html?.startsWith(this.gzipHtmlFolder) &&
      newTask.input.html?.length === this.gzipHtmlFolder.length + 36 // 1 + 32 + 3
    ) {
      const htmlContent = await this.getHtmlFromMinioGzipFile(
        newTask.input.html,
      );
      newTask.input = { ...newTask.input, html: htmlContent };
    }
    return InternalTaskDto.fromEntity(newTask);
  }

  async getHtmlFromMinioGzipFile(path: string) {
    const { stream } = await this.s3Service.getObject(path);
    const gunzip = createGunzip();
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream
        .pipe(gunzip)
        .on('data', (chunk: Buffer) => chunks.push(chunk))
        .on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf-8'));
        })
        .on('error', reject);
    });
  }

  async reproduceTaskMessages(offset?: number, limit?: number) {
    const queryBuilder = this.wizardTaskService.taskRepository
      .createQueryBuilder('task')
      .select('DISTINCT task.namespace_id', 'namespaceId')
      .where('task.ended_at IS NULL')
      .andWhere('task.canceled_at IS NULL');

    if (offset !== undefined) {
      queryBuilder.offset(offset);
    }
    if (limit !== undefined) {
      queryBuilder.limit(limit);
    }

    const results = await queryBuilder.getRawMany<{ namespaceId: string }>();
    const namespaceIds = results.map((r) => r.namespaceId);

    for (const namespaceId of namespaceIds) {
      await this.tasksService.checkTaskMessage(namespaceId);
    }

    return {
      message: `Reproduced task messages for ${namespaceIds.length} namespaces`,
      count: namespaceIds.length,
      namespaceIds,
    };
  }
}
