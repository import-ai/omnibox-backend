import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
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
import { context, propagation } from '@opentelemetry/api';
import { KafkaService } from 'omniboxd/kafka/kafka.service';

@Injectable()
export class WizardTaskService {
  private readonly kafkaTasksTopic: string;

  constructor(
    @InjectRepository(Task) public taskRepository: Repository<Task>,
    private readonly userService: UserService,
    private readonly kafkaService: KafkaService,
    private readonly configService: ConfigService,
  ) {
    this.kafkaTasksTopic = this.configService.get<string>(
      'OBB_TASKS_TOPIC',
      'omnibox-tasks',
    );
  }

  injectTraceHeaders(task: Partial<Task>) {
    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);
    task.payload = { ...(task.payload || {}), trace_headers: traceHeaders };
    return task;
  }

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

  private async emitTask(data: Partial<Task>, repo?: Repository<Task>) {
    repo = repo || this.taskRepository;
    const task = await repo.save(repo.create(this.injectTraceHeaders(data)));
    await this.kafkaService.produce(this.kafkaTasksTopic, [
      {
        key: task.namespaceId,
        value: JSON.stringify({
          id: task.id,
          namespace_id: task.namespaceId,
          function: task.function,
        }),
      },
    ]);

    return task;
  }

  async emitCollectTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    input: { html: string; url: string; title?: string },
    repo?: Repository<Task>,
  ) {
    return this.emitTask(
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

  async emitGenerateVideoNoteTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    input: { html: string; url: string; title?: string },
    repo?: Repository<Task>,
  ) {
    return this.emitTask(
      {
        function: 'generate_video_note',
        input,
        namespaceId,
        payload: { resource_id: resourceId },
        userId,
      },
      repo,
    );
  }

  async emitExtractTagsTask(
    userId: string,
    resourceId: string,
    namespaceId: string,
    text: string,
    repo?: Repository<Task>,
  ) {
    // Check if auto-tag is enabled for this user
    const isEnabled = await this.userService.isAutoTagEnabled(userId);
    if (!isEnabled) {
      return null;
    }

    const lang = await this.getUserLanguage(userId);
    return this.emitTask(
      {
        function: 'extract_tags',
        input: { text, lang },
        namespaceId,
        payload: {
          resource_id: resourceId,
        },
        userId,
      },
      repo,
    );
  }

  async emitExtractTagsTaskFromTask(parentTask: Task, repo?: Repository<Task>) {
    // Check if auto-tag is enabled for this user
    const isEnabled = await this.userService.isAutoTagEnabled(
      parentTask.userId,
    );
    if (!isEnabled) {
      return null;
    }

    const lang = await this.getUserLanguage(parentTask.userId);
    return this.emitTask(
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
      repo,
    );
  }

  async emitGenerateTitleTask(
    userId: string,
    namespaceId: string,
    payload: { resource_id: string; parent_task_id?: string },
    input: { text: string },
    repo?: Repository<Task>,
  ) {
    const lang = await this.getUserLanguage(userId);
    return this.emitTask(
      {
        function: 'generate_title',
        input: { lang, ...input },
        namespaceId,
        payload,
        userId,
      },
      repo,
    );
  }

  async emitFileReaderTask(
    userId: string,
    resource: Resource,
    source?: string,
    repo?: Repository<Task>,
  ) {
    return this.emitTask(
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

  async emitUpsertIndexTask(
    priority: number,
    userId: string,
    resource: Resource,
    repo?: Repository<Task>,
  ) {
    if (resource.resourceType === ResourceType.FOLDER || !resource.content) {
      return;
    }
    return this.emitTask(
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
      repo,
    );
  }

  async emitDeleteIndexTask(
    userId: string,
    resource: Resource,
    repo?: Repository<Task>,
  ) {
    return this.emitTask(
      {
        function: 'delete_index',
        input: {
          resource_id: resource.id,
        },
        namespaceId: resource.namespaceId,
        userId,
        payload: { resource_id: resource.id },
      },
      repo,
    );
  }

  async emitUpsertMessageIndexTask(
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
    return this.emitTask(
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
      repo,
    );
  }

  async emitDeleteConversationTask(
    namespaceId: string,
    userId: string,
    conversationId: string,
    priority: number,
    repo?: Repository<Task>,
  ) {
    return this.emitTask(
      {
        function: 'delete_conversation',
        priority,
        input: { conversation_id: conversationId },
        payload: { conversation_id: conversationId },
        namespaceId,
        userId,
      },
      repo,
    );
  }
}
