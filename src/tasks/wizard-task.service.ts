import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserService } from 'omniboxd/user/user.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import {
  Message,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { Transaction } from 'omniboxd/utils/transaction-utils';
import { TasksService } from 'omniboxd/tasks/tasks.service';

@Injectable()
export class WizardTaskService {
  constructor(
    @InjectRepository(Task) public taskRepository: Repository<Task>,
    private readonly userService: UserService,
    private readonly tasksService: TasksService,
  ) {}

  private async getUserLanguage(
    userId: string,
  ): Promise<'简体中文' | 'English' | undefined> {
    const languageOption = await this.userService.getOption(userId, 'language');
    if (languageOption?.value) {
      if (languageOption.value === 'zh-CN') {
        return '简体中文';
      } else if (languageOption.value === 'en-US') {
        return 'English';
      }
    }
    return undefined;
  }

  async emitCollectTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    input: { html: string; url: string; title?: string },
    tx?: Transaction,
  ) {
    return this.tasksService.emitTask(
      {
        function: 'collect',
        input,
        namespaceId,
        payload: { resource_id: resourceId },
        userId,
      },
      tx,
    );
  }

  async emitGenerateVideoNoteTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    input: { html: string; url: string; title?: string },
    tx?: Transaction,
  ) {
    return this.tasksService.emitTask(
      {
        function: 'generate_video_note',
        input,
        namespaceId,
        payload: { resource_id: resourceId },
        userId,
      },
      tx,
    );
  }

  async emitExtractTagsTask(
    userId: string,
    resourceId: string,
    namespaceId: string,
    text: string,
    tx?: Transaction,
  ) {
    // Check if auto-tag is enabled for this user
    const isEnabled = await this.userService.isAutoTagEnabled(userId);
    if (!isEnabled) {
      return null;
    }

    const lang = await this.getUserLanguage(userId);
    return this.tasksService.emitTask(
      {
        function: 'extract_tags',
        input: { text, lang },
        namespaceId,
        payload: {
          resource_id: resourceId,
        },
        userId,
      },
      tx,
    );
  }

  async emitExtractTagsTaskFromTask(parentTask: Task, tx?: Transaction) {
    // Check if auto-tag is enabled for this user
    const isEnabled = await this.userService.isAutoTagEnabled(
      parentTask.userId,
    );
    if (!isEnabled) {
      return null;
    }

    const lang = await this.getUserLanguage(parentTask.userId);
    return this.tasksService.emitTask(
      {
        function: 'extract_tags',
        input: {
          text: parentTask.output?.markdown,
          lang: parentTask.input?.lang || lang,
        },
        namespaceId: parentTask.namespaceId,
        payload: {
          resource_id:
            parentTask.payload?.resource_id || parentTask.payload?.resourceId,
          parent_task_id: parentTask.id,
        },
        userId: parentTask.userId,
      },
      tx,
    );
  }

  async emitGenerateTitleTask(
    userId: string,
    namespaceId: string,
    payload: { resource_id: string; parent_task_id?: string },
    input: { text: string },
    tx?: Transaction,
  ) {
    const lang = await this.getUserLanguage(userId);
    return this.tasksService.emitTask(
      {
        function: 'generate_title',
        input: { lang, ...input },
        namespaceId,
        payload,
        userId,
      },
      tx,
    );
  }

  async emitFileReaderTask(
    userId: string,
    resource: Resource,
    source?: string,
    tx?: Transaction,
  ) {
    return this.tasksService.emitTask(
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
      tx,
    );
  }

  async emitUpsertIndexTask(
    priority: number,
    userId: string,
    resource: Resource,
    tx?: Transaction,
  ) {
    if (resource.resourceType === ResourceType.FOLDER || !resource.content) {
      return;
    }
    return this.tasksService.emitTask(
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
        payload: { resource_id: resource.id },
        namespaceId: resource.namespaceId,
        userId: userId,
      },
      tx,
    );
  }

  async emitDeleteIndexTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    tx?: Transaction,
  ) {
    return this.tasksService.emitTask(
      {
        function: 'delete_index',
        input: {
          resource_id: resourceId,
        },
        namespaceId,
        userId,
        payload: { resource_id: resourceId },
      },
      tx,
    );
  }

  async emitUpsertMessageIndexTask(
    priority: number,
    userId: string,
    namespaceId: string,
    conversationId: string,
    message: Message,
    tx?: Transaction,
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
    return this.tasksService.emitTask(
      {
        function: 'upsert_message_index',
        priority,
        input: {
          conversation_id: conversationId,
          message_id: message.id,
          message: message.message,
        },
        payload: { conversation_id: conversationId, message_id: message.id },
        namespaceId,
        userId,
      },
      tx,
    );
  }

  async emitDeleteConversationTask(
    namespaceId: string,
    userId: string,
    conversationId: string,
    priority: number,
    tx?: Transaction,
  ) {
    return this.tasksService.emitTask(
      {
        function: 'delete_conversation',
        priority,
        input: { conversation_id: conversationId },
        payload: { conversation_id: conversationId },
        namespaceId,
        userId,
      },
      tx,
    );
  }
}
