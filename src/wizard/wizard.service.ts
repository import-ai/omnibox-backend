import { buffer } from 'node:stream/consumers';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { S3Service } from 'omniboxd/s3/s3.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { InternalTaskDto } from 'omniboxd/tasks/dto/task.dto';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { numberToBigintString } from 'omniboxd/utils/bigint-utils';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { CompressedCollectRequestDto } from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectUrlResponseDto } from 'omniboxd/wizard/dto/collect-url-request.dto';
import {
  NextTaskRequestDto,
  TaskCallbackDto,
} from 'omniboxd/wizard/dto/task-callback.dto';
import { CollectProcessor } from 'omniboxd/wizard/processors/collect.processor';
import { CollectUrlProcessor } from 'omniboxd/wizard/processors/collect-url.processor';
import { ExtractTagsProcessor } from 'omniboxd/wizard/processors/extract-tags.processor';
import { GenerateTitleProcessor } from 'omniboxd/wizard/processors/generate-title.processor';
import { Processor } from 'omniboxd/wizard/processors/processor.abstract';
import { ReaderProcessor } from 'omniboxd/wizard/processors/reader.processor';
import { Image, ProcessedImage } from 'omniboxd/wizard/types/wizard.types';
import { IsNull } from 'typeorm';
import { createGunzip } from 'zlib';

import { TempfileDto } from './dto/tempfile.dto';

@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);
  private readonly processors: Record<string, Processor>;

  private readonly gzipHtmlFolder: string = 'collect/html/gzip';

  // A task whose heartbeat is older than this is considered stale and can be
  // (re)claimed by a worker.
  private readonly heartbeatTimeoutMs: number;

  constructor(
    private readonly wizardTaskService: WizardTaskService,
    private readonly tasksService: TasksService,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly tagService: TagService,
    private readonly configService: ConfigService,
    private readonly attachmentsService: AttachmentsService,
    private readonly s3Service: S3Service,
    private readonly resourcesService: ResourcesService,
    private readonly i18n: I18nService,
  ) {
    // All file_reader_* kinds share post-processing; one ReaderProcessor instance
    // is registered under every per-format kind. The legacy `file_reader` name is
    // also registered so tasks emitted before the per-format split still get
    // post-processed when they finish.
    const readerProcessor = new ReaderProcessor(
      this.namespaceResourcesService,
      this.resourcesService,
      this.tagService,
      this.i18n,
    );
    this.processors = {
      collect: new CollectProcessor(
        this.namespaceResourcesService,
        this.resourcesService,
        this.tagService,
        this.i18n,
      ),
      file_reader: readerProcessor,
      file_reader_text: readerProcessor,
      file_reader_ppt: readerProcessor,
      file_reader_word: readerProcessor,
      file_reader_pdf: readerProcessor,
      file_reader_audio: readerProcessor,
      file_reader_video: readerProcessor,
      file_reader_image: readerProcessor,
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
      generate_audio_note: new CollectProcessor(
        this.namespaceResourcesService,
        this.resourcesService,
        this.tagService,
        this.i18n,
      ),
      collect_url: new CollectUrlProcessor(
        this.namespaceResourcesService,
        this.i18n,
      ),
    };

    this.heartbeatTimeoutMs = parseInt(
      this.configService.get<string>('OBB_TASK_HEARTBEAT_TIMEOUT_MS', '10000'),
      10,
    );
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
      undefined,
      undefined,
      true, // autoRenameOnConflict for URL-based names
    );

    const { objectKey } = await this.s3Service.generateObjectKey(
      this.gzipHtmlFolder,
      'html.gz',
    );
    await this.s3Service.putObject(
      objectKey,
      compressedHtml.buffer,
      compressedHtml.mimetype,
      { resourceId: resource.id, url },
    );

    const task = await this.wizardTaskService.emitWebAnalysisTask(
      userId,
      namespaceId,
      resource.id,
      { html_s3_key: objectKey, url, title },
    );
    return { task_id: task.id, resource_id: resource.id };
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
  ): Promise<CollectUrlResponseDto> {
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
      undefined,
      undefined,
      true, // autoRenameOnConflict for URL-based names
    );

    // Create a collect_url task that will fetch HTML and create a collect task
    await this.wizardTaskService.emitCollectUrlTask(
      userId,
      namespaceId,
      resource.id,
      {
        url,
      },
    );

    return CollectUrlResponseDto.fromResourceId(resource.id);
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

    // Ignore callbacks from a worker that no longer owns the task (it was
    // reclaimed as stale and is now run by another worker), or for a task that
    // has already completed. Guards the race where a worker finishes right as
    // it loses ownership. `worker_id` rides in directly for S3/chunk payloads
    // that bypass class-transformer aliasing.
    const callbackWorkerId =
      data.workerId ?? (data as Record<string, any>).worker_id;
    if (task.workerId && callbackWorkerId !== task.workerId) {
      this.logger.warn(
        `Ignoring callback for task ${task.id} from worker ${callbackWorkerId}; currently owned by ${task.workerId}`,
      );
      return { taskId: task.id, function: task.function };
    }
    if (task.status !== TaskStatus.RUNNING) {
      this.logger.warn(
        `Ignoring callback for task ${task.id}; status is ${task.status}, not running`,
      );
      return { taskId: task.id, function: task.function };
    }

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

    // Persist atomically, guarded on task id + worker id + running status, so a
    // callback that lost the race (task reclaimed by another worker, or no
    // longer running, between the read above and this write) cannot overwrite a
    // task it no longer owns.
    const { affected } = await this.wizardTaskService.taskRepository.update(
      {
        id: task.id,
        status: TaskStatus.RUNNING,
        workerId: task.workerId ?? IsNull(),
      },
      {
        endedAt: task.endedAt,
        exception: task.exception,
        output: task.output,
        status: task.status,
      },
    );
    if (!affected) {
      this.logger.warn(
        `Ignoring callback for task ${task.id}; not running or no longer owned by worker ${task.workerId} at write time`,
      );
      return { taskId: task.id, function: task.function };
    }
    await this.tasksService.callTaskHook(task.namespaceId, task.id);

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
  }

  private async dispatchNextTasks(
    parentTask: Task,
    nextTasks: NextTaskRequestDto[],
  ): Promise<void> {
    for (const nextTask of nextTasks) {
      try {
        let input = nextTask.input;
        if (typeof input.html === 'string') {
          const { html, ...rest } = input;
          input = {
            ...rest,
            html_s3_key: await this.tasksService.uploadHtmlToS3(html),
          };
        }
        const createdTask = await this.tasksService.emitTask({
          namespaceId: parentTask.namespaceId,
          userId: parentTask.userId,
          priority:
            nextTask.priority !== undefined
              ? numberToBigintString(nextTask.priority)
              : parentTask.priority,
          function: nextTask.function,
          input,
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

  async updateHeartbeat(taskId: string, workerId: string): Promise<boolean> {
    return await this.tasksService.updateHeartbeat(taskId, workerId);
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
    const s3Key = this.tasksService.getHtmlS3Key(newTask.input);
    if (s3Key) {
      const htmlContent = await this.getHtmlFromMinioGzipFile(s3Key);
      newTask.input = { ...newTask.input, html: htmlContent };
    }
    return InternalTaskDto.fromEntity(newTask);
  }

  async pollTask(
    functions: string[],
    workerId: string,
  ): Promise<InternalTaskDto | null> {
    const heartbeatCutoff = new Date(Date.now() - this.heartbeatTimeoutMs);
    const task = await this.tasksService.getNextTaskV2(
      functions,
      heartbeatCutoff,
    );
    if (!task) {
      return null;
    }
    const claimedTask = await this.tasksService.claimTask(
      task.id,
      heartbeatCutoff,
      workerId,
    );
    if (!claimedTask) {
      // Another worker claimed the task between selection and claim.
      return null;
    }
    const s3Key = this.tasksService.getHtmlS3Key(claimedTask.input);
    if (s3Key) {
      const htmlContent = await this.getHtmlFromMinioGzipFile(s3Key);
      claimedTask.input = { ...claimedTask.input, html: htmlContent };
    }
    return InternalTaskDto.fromEntity(claimedTask);
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
}
