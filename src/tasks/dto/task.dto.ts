import { Task } from 'omniboxd/tasks/tasks.entity';
import { isEmpty } from 'omniboxd/utils/is-empty';

function getTaskStatus(task: Task): string {
  if (task.canceledAt) {
    return 'canceled';
  }
  if (!isEmpty(task.exception)) {
    return 'error';
  }
  if (task.endedAt) {
    return 'finished';
  }
  if (task.startedAt) {
    return 'running';
  }
  return 'pending';
}

export class TaskMetaDto {
  id: string;
  namespace_id: string;
  user_id: string;
  priority: number;
  function: string;
  attrs: Record<string, any> | null;
  status: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
  canceled_at: string | null;

  protected static setValue(obj: TaskMetaDto, task: Task) {
    obj.id = task.id;
    obj.namespace_id = task.namespaceId;
    obj.user_id = task.userId;
    obj.priority = task.priority;
    obj.function = task.function;

    if (task.payload) {
      obj.attrs = {};
      for (const [key, value] of Object.entries(task.payload)) {
        if (key !== 'trace_headers') {
          obj.attrs[key] = value;
        }
      }
    }

    obj.status = getTaskStatus(task);
    obj.created_at = task.createdAt.toISOString();
    obj.updated_at = task.updatedAt.toISOString();
    obj.started_at = task.startedAt?.toISOString() || null;
    obj.ended_at = task.endedAt?.toISOString() || null;
    obj.canceled_at = task.canceledAt?.toISOString() || null;
  }

  static fromEntity(task: Task): TaskMetaDto {
    const dto = new TaskMetaDto();
    this.setValue(dto, task);
    return dto;
  }
}

export class TaskDto extends TaskMetaDto {
  input: Record<string, any>;
  output: Record<string, any> | null;
  exception: Record<string, any> | null;

  static fromEntity(task: Task): TaskDto {
    const dto = new TaskDto();
    this.setValue(dto, task);

    dto.input = task.input;
    dto.output = task.output;
    dto.exception = task.exception;
    return dto;
  }
}
