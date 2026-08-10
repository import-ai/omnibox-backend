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
  RERUNNABLE_TASK_STATUSES,
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
   * Re-run the parsing of a resource whose content is missing: either the last
   * parse task failed (quota exhausted, timeout, unsupported function, ...) or
   * no task survived at all and the resource stayed blank.
   */
  async retryParse(
    namespaceId: string,
    userId: string,
    resourceId: string,
  ): Promise<TaskDto> {
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
    const tasks = await this.tasksService.getParseTasksByResourceId(
      namespaceId,
      resourceId,
    );

    if (
      tasks.some((task) =>
        [TaskStatus.PENDING, TaskStatus.RUNNING].includes(task.status),
      )
    ) {
      const message = this.i18n.t('task.errors.parseAlreadyRunning');
      throw new AppException(
        message,
        'PARSE_ALREADY_RUNNING',
        HttpStatus.CONFLICT,
      );
    }

    const staleError = isTaskErrorContent(resource.content, tasks);
    const [latestTask] = tasks;

    if (latestTask && RERUNNABLE_TASK_STATUSES.includes(latestTask.status)) {
      await this.clearStaleErrorContent(resource, userId, staleError);
      return await this.tasksService.rerunTask(latestTask.id);
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
    return TaskDto.fromEntity(
      await this.emitBlankResourceTask(resource, userId),
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
