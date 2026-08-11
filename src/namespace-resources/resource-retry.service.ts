import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TaskDto } from 'omniboxd/tasks/dto/task.dto';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import {
  FAILED_TASK_STATUSES,
  PARSE_FUNCTIONS,
  TasksService,
} from 'omniboxd/tasks/tasks.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { isTaskErrorContent } from 'omniboxd/wizard/processors/task-error-content';

@Injectable()
export class ResourceRetryService {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly resourcesService: ResourcesService,
    private readonly tasksService: TasksService,
    private readonly wizardTaskService: WizardTaskService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Re-run everything that failed for a resource: quota-exhausted parsing, a
   * timed-out index upsert, a tag extraction that errored, ... Each re-emitted
   * task points back at the one it replaces through `retriedFromTaskId`, which
   * is what lets the UI hide the superseded failure.
   *
   * When nothing failed but the resource stayed blank without a surviving task
   * row, fall back to re-reading the file or re-collecting the link URL.
   */
  async retry(
    namespaceId: string,
    userId: string,
    resourceId: string,
  ): Promise<TaskDto[]> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    const resource = await this.resourcesService.getResourceOrFail(
      namespaceId,
      resourceId,
    );
    const tasks = await this.tasksService.getTaskEntitiesByResourceId(
      namespaceId,
      resourceId,
    );

    if (
      tasks.some((task) =>
        [TaskStatus.PENDING, TaskStatus.RUNNING].includes(task.status),
      )
    ) {
      const message = this.i18n.t('task.errors.retryAlreadyRunning');
      throw new AppException(
        message,
        'RETRY_ALREADY_RUNNING',
        HttpStatus.CONFLICT,
      );
    }

    const retryable = this.getRetryableTasks(tasks);
    // Only a parse failure ever writes a placeholder into the resource body, so
    // only a parse retry may clear it. `staleError` is likewise resolved
    // against parse tasks alone: real content and user edits stay untouched.
    const staleError = isTaskErrorContent(
      resource.content,
      tasks.filter((task) => PARSE_FUNCTIONS.has(task.function)),
    );

    if (retryable.length > 0) {
      const reparsing = retryable.some((task) =>
        PARSE_FUNCTIONS.has(task.function),
      );
      await this.clearStaleErrorContent(
        resource,
        userId,
        staleError && reparsing,
      );
      const rerun: TaskDto[] = [];
      for (const task of retryable) {
        rerun.push(await this.tasksService.rerunTask(task.id));
      }
      return rerun;
    }

    if (resource.content && !staleError) {
      const message = this.i18n.t('task.errors.nothingToRetry');
      throw new AppException(
        message,
        'RETRY_NOT_ELIGIBLE',
        HttpStatus.CONFLICT,
      );
    }

    await this.clearStaleErrorContent(resource, userId, staleError);
    return [
      TaskDto.fromEntity(await this.emitBlankResourceTask(resource, userId)),
    ];
  }

  /**
   * Failed tasks that no later task already replaced. A retry emitted for a
   * failure carries that failure's id in `retriedFromTaskId`, so the failure is
   * history and must not be re-emitted a second time.
   */
  private getRetryableTasks(tasks: Task[]): Task[] {
    const superseded = new Set(
      tasks
        .map((task) => task.retriedFromTaskId)
        .filter((id): id is string => !!id),
    );
    return tasks.filter(
      (task) =>
        FAILED_TASK_STATUSES.includes(task.status) && !superseded.has(task.id),
    );
  }

  private async emitBlankResourceTask(
    resource: Resource,
    userId: string,
  ): Promise<Task> {
    if (resource.resourceType === ResourceType.FILE && resource.fileId) {
      return await this.wizardTaskService.emitFileReaderTask(userId, resource);
    }
    const url = resource.attrs?.url;
    if (resource.resourceType === ResourceType.LINK && url) {
      return await this.wizardTaskService.emitCollectUrlTask(
        userId,
        resource.namespaceId,
        resource.id,
        { url },
      );
    }
    const message = this.i18n.t('task.errors.nothingToRetry');
    throw new AppException(message, 'RETRY_NOT_ELIGIBLE', HttpStatus.CONFLICT);
  }

  private async clearStaleErrorContent(
    resource: Resource,
    userId: string,
    staleError: boolean,
  ): Promise<void> {
    if (!staleError) {
      return;
    }
    await this.resourcesService.updateResource(
      resource.namespaceId,
      resource.id,
      userId,
      { content: '' },
    );
  }
}
