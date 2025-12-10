import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import {
  CollectRequestDto,
  CompressedCollectRequestDto,
} from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omniboxd/wizard/dto/collect-response.dto';
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
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { Image, ProcessedImage } from 'omniboxd/wizard/types/wizard.types';
import { InternalTaskDto } from 'omniboxd/tasks/dto/task.dto';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { FetchTaskRequest } from 'omniboxd/wizard/dto/fetch-task-request.dto';
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

  async collect(
    namespaceId: string,
    userId: string,
    data: CollectRequestDto,
  ): Promise<CollectResponseDto> {
    const { html, url, title, parentId } = data;
    if (!namespaceId || !parentId || !url || !html) {
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
      parentId,
      attrs: { url },
    };
    const resource = await this.namespaceResourcesService.create(
      userId,
      namespaceId,
      resourceDto,
    );

    const task = await this.wizardTaskService.emitCollectTask(
      userId,
      namespaceId,
      resource.id,
      { html, url, title },
    );
    return { task_id: task.id, resource_id: resource.id };
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
      task.output = data.output || null;
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
    } finally {
      await this.tasksService.checkTaskMessage(task.namespaceId);
    }
  }

  async postprocess(task: Task): Promise<Record<string, any>> {
    let result: Record<string, any> = {};

    if (task.function in this.processors) {
      const processor = this.processors[task.function];
      result = await processor.process(task);
    }

    // Trigger extract_tags after collect or file_reader tasks finish
    if (
      ['collect', 'file_reader', 'generate_video_note'].includes(
        task.function,
      ) &&
      !isEmpty(task.output?.markdown) &&
      isEmpty(result.tagIds)
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
        await this.wizardTaskService.emitExtractTagsTaskFromTask(parentTask);

      if (extractTagsTask) {
        this.logger.debug(
          `Triggered extract_tags task ${extractTagsTask.id} for parent task ${parentTask.id}`,
        );
      }
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
        await this.wizardTaskService.emitGenerateTitleTask(
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

  async fetchTask(query: FetchTaskRequest): Promise<InternalTaskDto | null> {
    const andConditions: string[] = [];
    if (query.namespace_id) {
      andConditions.push(`tasks.namespace_id = '${query.namespace_id}'`);
    }
    if (query.functions) {
      const condition = query.functions
        .split(',')
        .map((x) => `'${x}'`)
        .join(', ');
      andConditions.push(`tasks.function IN (${condition})`);
    }

    // Filter by file extensions for file_reader tasks
    let fileExtFilter: string;
    if (query.file_extensions) {
      const supportedExtensions = query.file_extensions
        .split(',')
        .map((ext) => ext.replace(/'/g, "''"));
      const extConditions = supportedExtensions
        .map((ext) => `LOWER(tasks.input->>'filename') LIKE '%${ext}'`)
        .join(' OR ');
      fileExtFilter = `
        AND (
          tasks.function != 'file_reader'
          OR (${extConditions})
        )
      `;
    } else {
      // If file_extensions not provided, exclude all file_reader tasks
      fileExtFilter = `AND tasks.function != 'file_reader'`;
    }

    const andCondition: string = andConditions.map((x) => `AND ${x}`).join(' ');
    const rawQuery = `
      WITH
        cutoff_time AS (
          SELECT NOW() - INTERVAL '10 minutes' AS time
        ),
        running_tasks_sub_query AS (
          SELECT
            namespace_id,
            COUNT(id) AS running_count
          FROM tasks
          CROSS JOIN cutoff_time
          WHERE started_at IS NOT NULL
          AND started_at > cutoff_time.time
          AND ended_at IS NULL
          AND canceled_at IS NULL
          AND deleted_at IS NULL
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
          AND tasks.ended_at IS NULL
          AND tasks.canceled_at IS NULL
          AND tasks.deleted_at IS NULL
          AND COALESCE(running_tasks_sub_query.running_count, 0) < COALESCE(namespaces.max_running_tasks, 0)
          ${andCondition}
          ${fileExtFilter}
          ORDER BY
            priority DESC,
            tasks.created_at
          LIMIT 1
      )
      SELECT *
      FROM tasks
      WHERE id IN (SELECT id FROM id_subquery);
    `;

    const queryResult =
      await this.wizardTaskService.taskRepository.query(rawQuery);

    if (queryResult.length > 0) {
      const record = queryResult[0];
      const task = this.wizardTaskService.taskRepository.create({
        ...(record as Task),
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        startedAt: new Date(),
        userId: record.user_id,
        namespaceId: record.namespace_id,
      });
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

    return null;
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
