import { Task } from 'src/tasks/tasks.entity';

class TasksDto {
  task_id: string;
  priority: number;

  namespace_id: string;
  user_id: string;

  function: string;
  input: Record<string, any>;
  payload: Record<string, any>;

  output: Record<string, any>;
  exception: Record<string, any>;

  started_at: Date;
  ended_at: Date;
  canceled_at: Date;

  static load(task: Task): TasksDto {
    const dto = new TasksDto();
    dto.task_id = task.id;
    dto.priority = task.priority;
    dto.namespace_id = task.namespace?.id;
    dto.user_id = task.user?.id;
    dto.function = task.function;
    dto.input = task.input;
    dto.payload = task.payload;
    dto.output = task.output;
    dto.exception = task.exception;
    dto.started_at = task.startedAt;
    dto.ended_at = task.endedAt;
    dto.canceled_at = task.canceledAt;
    return dto;
  }

  dump(): Task {
    const task = new Task();
    task.id = this.task_id;
    task.priority = this.priority;
    task.function = this.function;
    task.input = this.input;
    task.payload = this.payload;
    task.output = this.output;
    task.exception = this.exception;
    task.startedAt = this.started_at;
    task.endedAt = this.ended_at;
    task.canceledAt = this.canceled_at;
    task.user = { id: this.user_id } as any;
    task.namespace = { id: this.namespace_id } as any;
    return task;
  }
}
