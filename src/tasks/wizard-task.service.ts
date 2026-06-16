import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  Message,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { TagService } from 'omniboxd/tag/tag.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { UserService } from 'omniboxd/user/user.service';
import { numberToBigintString } from 'omniboxd/utils/bigint-utils';
import { Transaction } from 'omniboxd/utils/transaction-utils';
import * as path from 'path';
import { Repository } from 'typeorm';

// Maps an uploaded file's extension to the per-format file_reader function kind
// that the matching wizard (base or pro) is able to handle. Extensions absent
// from this map are unsupported by either wizard, so no task is emitted for them.
const EXT_TO_FILE_READER_FN: Record<string, string> = {
  // base wizard
  '.md': 'file_reader_text',
  '.txt': 'file_reader_text',
  '.pptx': 'file_reader_ppt',
  '.ppt': 'file_reader_ppt',
  '.docx': 'file_reader_word',
  '.doc': 'file_reader_word',
  // wizard-pro
  '.pdf': 'file_reader_pdf',
  '.wav': 'file_reader_audio',
  '.mp3': 'file_reader_audio',
  '.opus': 'file_reader_audio',
  '.m4a': 'file_reader_audio',
  '.mp4': 'file_reader_video',
  '.avi': 'file_reader_video',
  '.mov': 'file_reader_video',
  '.mkv': 'file_reader_video',
  '.flv': 'file_reader_video',
  '.wmv': 'file_reader_video',
  '.webm': 'file_reader_video',
  '.png': 'file_reader_image',
  '.jpg': 'file_reader_image',
  '.jpeg': 'file_reader_image',
};

@Injectable()
export class WizardTaskService {
  constructor(
    @InjectRepository(Task) public taskRepository: Repository<Task>,
    private readonly userService: UserService,
    private readonly tasksService: TasksService,
    private readonly tagService: TagService,
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

  private async getUserOptions(
    userId: string,
  ): Promise<Record<string, string>> {
    const userOptions = await this.userService.listOption(userId);
    return userOptions.reduce(
      (acc: Record<string, string>, opt: { name: string; value: string }) => {
        acc[opt.name] = opt.value;
        return acc;
      },
      {},
    );
  }

  async emitWebAnalysisTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    input: { html_s3_key: string; url: string; title?: string },
    tx?: Transaction,
  ) {
    const userOptions = await this.getUserOptions(userId);
    return this.tasksService.emitTask(
      {
        function: 'web_analysis',
        input,
        namespaceId,
        payload: {
          resource_id: resourceId,
          user: {
            options: userOptions,
          },
        },
        userId,
      },
      tx,
    );
  }

  async emitCollectTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    input: { url: string },
    tx?: Transaction,
  ) {
    const userOptions = await this.getUserOptions(userId);
    return this.tasksService.emitTask(
      {
        function: 'collect',
        input,
        namespaceId,
        payload: {
          resource_id: resourceId,
          user: {
            options: userOptions,
          },
        },
        userId,
      },
      tx,
    );
  }

  async emitGenerateVideoNoteTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    input: { url: string; html_s3_key?: string; title?: string },
    tx?: Transaction,
  ) {
    const userOptions = await this.getUserOptions(userId);
    return this.tasksService.emitTask(
      {
        function: 'generate_video_note',
        input,
        namespaceId,
        payload: {
          resource_id: resourceId,
          user: {
            options: userOptions,
          },
        },
        userId,
      },
      tx,
    );
  }

  async emitGenerateAudioNoteTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    input: { url: string; html_s3_key?: string; title?: string },
    tx?: Transaction,
  ) {
    const userOptions = await this.getUserOptions(userId);
    return this.tasksService.emitTask(
      {
        function: 'generate_audio_note',
        input,
        namespaceId,
        payload: {
          resource_id: resourceId,
          user: {
            options: userOptions,
          },
        },
        userId,
      },
      tx,
    );
  }

  async emitCollectUrlTask(
    userId: string,
    namespaceId: string,
    resourceId: string,
    input: { url: string },
    tx?: Transaction,
  ) {
    const userOptions = await this.getUserOptions(userId);
    return this.tasksService.emitTask(
      {
        function: 'collect_url',
        input,
        namespaceId,
        payload: {
          resource_id: resourceId,
          user: {
            options: userOptions,
          },
        },
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
    input: { content: string },
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
    const fileName = resource.attrs.original_name ?? resource.attrs.filename;
    const ext = path.extname(fileName ?? '').toLowerCase();
    const fn = EXT_TO_FILE_READER_FN[ext];
    if (!fn) {
      // Unsupported by either wizard: fail loudly rather than silently emitting
      // no task (which would leave the resource without a reader forever).
      throw new AppException(
        `No file_reader function kind for extension "${ext}" (resource ${resource.id})`,
        'UNSUPPORTED_FILE_EXTENSION',
        HttpStatus.BAD_REQUEST,
      );
    }

    const userOptions = await this.getUserOptions(userId);
    return this.tasksService.emitTask(
      {
        function: fn,
        input: {
          title: resource.name,
          original_name: resource.attrs.original_name,
          filename: resource.attrs.filename,
          mimetype: resource.attrs.mimetype,
          resource_id: resource.id,
          ...(userOptions.language ? { language: userOptions.language } : {}),
        },
        payload: {
          resource_id: resource.id,
          source: source || 'default',
          user: {
            options: userOptions,
          },
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
    const resourceTags = await this.tagService.getTagsByIds(
      resource.namespaceId,
      resource.tagIds || [],
    );
    return this.tasksService.emitTask(
      {
        function: 'upsert_index',
        priority: numberToBigintString(priority),
        input: {
          title: resource.name,
          content: resource.content,
          meta_info: {
            user_id: resource.userId,
            resource_id: resource.id,
            parent_id: resource.parentId,
            resource_tag_ids: resourceTags.map((tag) => tag.id),
            resource_tag_names: resourceTags.map((tag) => tag.name),
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
        priority: numberToBigintString(priority),
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
        priority: numberToBigintString(priority),
        input: { conversation_id: conversationId },
        payload: { conversation_id: conversationId },
        namespaceId,
        userId,
      },
      tx,
    );
  }
}
