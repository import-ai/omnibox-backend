import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { trace } from '@opentelemetry/api';
import { Span } from 'nestjs-otel';
import { TasksService } from 'omniboxd/tasks/tasks.service';

@Injectable()
export class TasksCronService {
  private readonly logger = new Logger(TasksCronService.name);

  constructor(private readonly tasksService: TasksService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  @Span('TasksCronService.logOldestPendingOrRunningTask')
  async logOldestPendingOrRunningTask(): Promise<void> {
    const span = trace.getActiveSpan();
    const task = await this.tasksService.findOldestPendingOrRunningTask();
    if (!task) {
      span?.setAttribute('task.found', false);
      return;
    }
    span?.setAttributes({
      'task.found': true,
      'task.id': task.id,
      'task.namespace_id': task.namespaceId,
      'task.status': task.status,
      'task.created_at': task.createdAt.toISOString(),
    });
    this.logger.log(
      `Oldest pending/running task: ${JSON.stringify({
        id: task.id,
        namespaceId: task.namespaceId,
        status: task.status,
        createdAt: task.createdAt,
      })}`,
    );
  }
}
