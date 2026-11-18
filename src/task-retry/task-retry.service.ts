import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { File } from 'omniboxd/files/entities/file.entity';
import { FilesService } from 'omniboxd/files/files.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import {
  effectiveFileNameFunction,
  fileIdEvidenceValues,
  inferFileReaderFunction,
  isPlainRecord,
  payloadResourceId,
  repairFileReaderInput,
  satisfiesWorkerContract,
  withTargetResourceId,
} from 'omniboxd/task-retry/file-reader-retry-input';
import { TaskDto } from 'omniboxd/tasks/dto/task.dto';
import { Task } from 'omniboxd/tasks/tasks.entity';
import {
  RerunPlan,
  RETRYABLE_TASK_STATUSES,
  TasksService,
} from 'omniboxd/tasks/tasks.service';

export interface TaskRetryContext {
  namespaceId: string;
  userId: string;
  /**
   * The target resource, already authorised by the resource-level entry. When
   * given, the CAN_EDIT check is skipped and the payload must point at it.
   */
  resource?: Resource;
}

@Injectable()
export class TaskRetryService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly permissionsService: PermissionsService,
    private readonly resourcesService: ResourcesService,
    private readonly filesService: FilesService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Task-level retry: bind the task to the requested namespace first, then
   * prepare and execute it as a single-task batch.
   */
  async rerunOne(
    namespaceId: string,
    userId: string,
    taskId: string,
  ): Promise<TaskDto> {
    const task = await this.tasksService.getInNamespace(namespaceId, taskId);
    const plan = await this.prepare(task, { namespaceId, userId });
    return await this.tasksService.applyRerun(plan);
  }

  /**
   * Read-only preparation: decide the function and the exact input the new
   * task will carry. Nothing is written and nothing is uploaded here; the
   * resource-level batch relies on that to write nothing when any task fails
   * to prepare.
   */
  async prepare(task: Task, ctx: TaskRetryContext): Promise<RerunPlan> {
    if (!RETRYABLE_TASK_STATUSES.includes(task.status)) {
      const message = this.i18n.t('task.errors.canOnlyRerunFailedOrCanceled');
      throw new AppException(
        message,
        'CAN_ONLY_RERUN_FAILED_OR_CANCELED',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (task.function !== 'file_reader') {
      return { original: task, function: task.function, input: task.input };
    }
    return await this.prepareLegacyFileReader(task, ctx);
  }

  /**
   * Resolve an old single-kind file_reader task into a per-format function and
   * an input that this generation's worker genuinely accepts. Anything that
   * cannot be proven against the target resource and, when repair is needed,
   * against the bound file row is rejected instead of queued.
   */
  private async prepareLegacyFileReader(
    task: Task,
    ctx: TaskRetryContext,
  ): Promise<RerunPlan> {
    if (!isPlainRecord(task.input)) {
      throw this.invalidInput();
    }
    const targetResourceId = payloadResourceId(task.payload);
    if (!targetResourceId) {
      throw this.invalidInput();
    }
    const resource = await this.resolveTargetResource(targetResourceId, ctx);

    const input = withTargetResourceId(task.input, resource.id);
    if (!input) {
      throw this.invalidInput();
    }

    const inference = inferFileReaderFunction(input);
    if (inference.kind === 'unsupported_extension') {
      throw this.unsupportedExtension();
    }
    if (
      inference.kind === 'resolved' &&
      satisfiesWorkerContract(input, inference.fn, resource.id)
    ) {
      return { original: task, function: inference.fn, input };
    }

    const file = await this.findBoundFile(task, ctx.namespaceId, resource);
    if (!file) {
      throw this.invalidInput();
    }

    let fn: string | undefined;
    if (inference.kind === 'conflict') {
      fn = effectiveFileNameFunction(file.name);
    } else {
      fn =
        effectiveFileNameFunction(file.name) === inference.fn
          ? inference.fn
          : undefined;
    }
    if (!fn) {
      throw this.invalidInput();
    }

    const repaired = repairFileReaderInput(input, fn, resource.id, {
      name: file.name,
      mimetype: file.mimetype,
    });
    if (!repaired) {
      throw this.invalidInput();
    }
    return { original: task, function: fn, input: repaired };
  }

  private async resolveTargetResource(
    targetResourceId: string,
    ctx: TaskRetryContext,
  ): Promise<Resource> {
    if (ctx.resource) {
      if (ctx.resource.id !== targetResourceId) {
        throw this.invalidInput();
      }
      return ctx.resource;
    }
    const resource = await this.resourcesService.getResource(
      ctx.namespaceId,
      targetResourceId,
    );
    if (!resource) {
      throw this.invalidInput();
    }
    // Only an old file_reader needs the caller's own permission: its target
    // comes from the task itself, not from an authorised path resource.
    await this.permissionsService.userHasPermissionOrFail(
      ctx.namespaceId,
      resource.id,
      ctx.userId,
      ResourcePermission.CAN_EDIT,
    );
    return resource;
  }

  /**
   * The old task may only be bound to the current file when a file-id field on
   * the task itself matches the resource's file and that file row still exists.
   * A resource fileId alone does not prove which file the old task read.
   */
  private async findBoundFile(
    task: Task,
    namespaceId: string,
    resource: Resource,
  ): Promise<File | null> {
    const values = fileIdEvidenceValues(task.input, task.payload);
    const fileId = resource.fileId;
    if (values.length === 0 || typeof fileId !== 'string' || fileId === '') {
      return null;
    }
    if (
      !values.every((value) => typeof value === 'string' && value === fileId)
    ) {
      return null;
    }
    return await this.filesService.getFile(namespaceId, fileId);
  }

  private invalidInput(): AppException {
    return new AppException(
      this.i18n.t('task.errors.invalidFileReaderInput'),
      'INVALID_FILE_READER_INPUT',
      HttpStatus.BAD_REQUEST,
    );
  }

  private unsupportedExtension(): AppException {
    return new AppException(
      this.i18n.t('task.errors.unsupportedFileExtension'),
      'UNSUPPORTED_FILE_EXTENSION',
      HttpStatus.BAD_REQUEST,
    );
  }
}
