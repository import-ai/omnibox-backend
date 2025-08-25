import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { Resource, ResourceType } from 'omniboxd/namespace-resources/namespace-resources.entity';
import {
  Message,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';

@Injectable()
export class WizardTaskService {
  constructor(
    @InjectRepository(Task) public taskRepository: Repository<Task>,
  ) {}

  async create(data: Partial<Task>, repo?: Repository<Task>) {
    const repository = repo || this.taskRepository;
    const task = repository.create(data);
    return await repository.save(task);
  }

  async createCollectTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    input: { html: string; url: string; title?: string },
    repo?: Repository<Task>,
  ) {
    return this.create(
      {
        function: 'collect',
        input,
        namespaceId,
        payload: { resource_id: resourceId },
        userId,
      },
      repo,
    );
  }

  async createExtractTagsTask(parentTask: Task, repo?: Repository<Task>) {
    return this.create(
      {
        function: 'extract_tags',
        input: { text: parentTask.output?.markdown },
        namespaceId: parentTask.namespaceId,
        payload: {
          resource_id:
            parentTask.payload?.resource_id || parentTask.payload?.resourceId,
          parent_task_id: parentTask.id,
        },
        userId: parentTask.userId,
      },
      repo,
    );
  }

  async createGenerateTitleTask(
    userId: string,
    namespaceId: string,
    payload: { resource_id: string; parent_task_id?: string },
    input: { text: string },
    repo?: Repository<Task>,
  ) {
    return this.create(
      {
        function: 'generate_title',
        input,
        namespaceId,
        payload,
        userId,
      },
      repo,
    );
  }

  async createFileReaderTask(
    userId: string,
    resource: Resource,
    source?: string,
    repo?: Repository<Task>,
  ) {
    return this.create(
      {
        function: 'file_reader',
        input: {
          title: resource.name,
          original_name: resource.attrs.original_name,
          filename: resource.attrs.filename,
          mimetype: resource.attrs.mimetype,
          resource_id: resource.id,
        },
        payload: {
          resource_id: resource.id,
          source: source || 'default',
        },
        namespaceId: resource.namespaceId,
        userId,
      },
      repo,
    );
  }

  async createIndexTask(
    priority: number,
    userId: string,
    resource: Resource,
    repo?: Repository<Task>,
  ) {
    if (resource.resourceType === ResourceType.FOLDER || !resource.content) {
      return;
    }
    return this.create(
      {
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
      },
      repo,
    );
  }

  async deleteIndexTask(
    userId: string,
    resource: Resource,
    repo?: Repository<Task>,
  ) {
    return this.create(
      {
        function: 'delete_index',
        input: {
          resource_id: resource.id,
        },
        namespaceId: resource.namespaceId,
        userId,
      },
      repo,
    );
  }

  async createMessageIndexTask(
    priority: number,
    userId: string,
    namespaceId: string,
    conversationId: string,
    message: Message,
    repo?: Repository<Task>,
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
    return this.create(
      {
        function: 'upsert_message_index',
        priority,
        input: {
          conversation_id: conversationId,
          message_id: message.id,
          message: message.message,
        },
        namespaceId,
        userId,
      },
      repo,
    );
  }

  async deleteConversationTask(
    namespaceId: string,
    userId: string,
    conversationId: string,
    priority: number,
    repo?: Repository<Task>,
  ) {
    return this.create(
      {
        function: 'delete_conversation',
        priority,
        input: {
          conversation_id: conversationId,
        },
        namespaceId,
        userId,
      },
      repo,
    );
  }
}
