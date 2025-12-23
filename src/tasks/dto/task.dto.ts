import { Task } from 'omniboxd/tasks/tasks.entity';

class TaskDtoBase {
  id: string;
  namespace_id: string;
  user_id: string;
  priority: number;
  function: string;
  status: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
  canceled_at: string | null;
  resource_id?: string;

  protected static setValue(obj: TaskDtoBase, task: Task) {
    obj.id = task.id;
    obj.namespace_id = task.namespaceId;
    obj.user_id = task.userId;
    obj.priority = task.priority;
    obj.function = task.function;
    obj.status = task.status;
    obj.created_at = task.createdAt.toISOString();
    obj.updated_at = task.updatedAt.toISOString();
    obj.started_at = task.startedAt?.toISOString() || null;
    obj.ended_at = task.endedAt?.toISOString() || null;
    obj.canceled_at = task.canceledAt?.toISOString() || null;
    obj.resource_id = task.resourceId || task.payload?.resource_id;
  }
}

export class InternalTaskDto extends TaskDtoBase {
  payload: Record<string, any> | null;
  input: Record<string, any>;
  output: Record<string, any> | null;
  exception: Record<string, any> | null;

  static fromEntity(task: Task): InternalTaskDto {
    const dto = new InternalTaskDto();
    this.setValue(dto, task);

    dto.payload = task.payload;
    dto.input = task.input;
    dto.output = task.output;
    dto.exception = task.exception;
    return dto;
  }
}

export class TaskMetaDto extends TaskDtoBase {
  attrs: Record<string, any> | null;
  canCancel?: boolean;
  canRerun?: boolean;
  canRedirect?: boolean;

  protected static setValue(obj: TaskMetaDto, task: Task) {
    super.setValue(obj, task);

    if (task.payload) {
      obj.attrs = {};
      for (const [key, value] of Object.entries(task.payload)) {
        if (key !== 'trace_headers') {
          obj.attrs[key] = value;
        }
      }
    }
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
