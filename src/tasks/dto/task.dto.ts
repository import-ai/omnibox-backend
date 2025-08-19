import { Task } from '../tasks.entity';

export class TaskDto {
  id: string;
  namespace_id: string;
  user_id: string;
  priority: number;
  function: string;
  input: Record<string, any>;
  payload: Record<string, any> | null;
  output: Record<string, any> | null;
  exception: Record<string, any> | null;
  status: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
  canceled_at: string | null;

  static fromEntity(task: Task, status: string): TaskDto {
    const dto = new TaskDto();
    dto.id = task.id;
    dto.namespace_id = task.namespaceId;
    dto.user_id = task.userId;
    dto.priority = task.priority;
    dto.function = task.function;
    dto.input = task.input;
    dto.payload = task.payload;
    dto.output = task.output;
    dto.exception = task.exception;
    dto.status = status;
    dto.created_at = task.createdAt.toISOString();
    dto.updated_at = task.updatedAt.toISOString();
    dto.started_at = task.startedAt?.toISOString() || null;
    dto.ended_at = task.endedAt?.toISOString() || null;
    dto.canceled_at = task.canceledAt?.toISOString() || null;
    return dto;
  }
}
