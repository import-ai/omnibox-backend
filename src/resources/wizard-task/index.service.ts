import { User } from 'src/user/entities/user.entity';
import { Resource } from 'src/resources/resources.entity';
import { Repository } from 'typeorm';
import { Task } from 'src/tasks/tasks.entity';
import {
  Message,
  OpenAIMessageRole,
} from 'src/messages/entities/message.entity';

export class Index {
  static async upsert(
    priority: number,
    user: User,
    resource: Resource,
    repo: Repository<Task>,
  ) {
    if (resource.resourceType === 'folder' || !resource.content) {
      return;
    }
    const task = repo.create({
      function: 'upsert_index',
      priority,
      input: {
        title: resource.name,
        content: resource.content,
        meta_info: {
          user_id: resource.user.id,
          resource_id: resource.id,
          parent_id: resource.parentId,
        },
      },
      namespace: { id: resource.namespaceId },
      user,
    });
    return await repo.save(task);
  }

  static async delete(user: User, resource: Resource, repo: Repository<Task>) {
    const task = repo.create({
      function: 'delete_index',
      input: {
        resource_id: resource.id,
      },
      namespace: { id: resource.namespaceId },
      user,
    });
    return await repo.save(task);
  }

  static async upsertMessageIndex(
    priority: number,
    userId: string,
    namespaceId: string,
    conversationId: string,
    message: Message,
    repo: Repository<Task>,
  ) {
    if (!message.message.content?.trim()) {
      return;
    }
    if (
      [OpenAIMessageRole.TOOL, OpenAIMessageRole.SYSTEM].includes(
        message.message.role,
      )
    ) {
      return;
    }
    const task = repo.create({
      function: 'upsert_message_index',
      priority,
      input: {
        conversation_id: conversationId,
        message_id: message.id,
        message: message.message,
      },
      namespace: { id: namespaceId },
      user: { id: userId },
    });
    return await repo.save(task);
  }
}
