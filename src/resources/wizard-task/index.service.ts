import { User } from 'omniboxd/user/entities/user.entity';
import { Resource, ResourceType } from 'omniboxd/resources/resources.entity';
import { Repository } from 'typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import {
  Message,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';

export class Index {
  static async upsert(
    priority: number,
    userId: string,
    resource: Resource,
    repo: Repository<Task>,
  ) {
    if (resource.resourceType === ResourceType.FOLDER || !resource.content) {
      return;
    }
    const task = repo.create({
      function: 'upsert_index',
      priority,
      input: {
        title: resource.name,
        content: resource.content,
        meta_info: {
          user_id: resource.userId,
          resource_id: resource.id,
          parent_id: resource.parentId,
        },
      },
      namespaceId: resource.namespaceId,
      userId: userId,
    });
    return await repo.save(task);
  }

  static async delete(user: User, resource: Resource, repo: Repository<Task>) {
    const task = repo.create({
      function: 'delete_index',
      input: {
        resource_id: resource.id,
      },
      namespaceId: resource.namespaceId,
      userId: user.id,
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
      namespaceId,
      userId,
    });
    return await repo.save(task);
  }

  static async deleteConversation(
    namespaceId: string,
    userId: string,
    conversationId: string,
    priority: number,
    repo: Repository<Task>,
  ) {
    return repo.save(
      repo.create({
        function: 'delete_conversation',
        priority,
        input: {
          conversation_id: conversationId,
        },
        namespaceId,
        userId,
      }),
    );
  }
}
