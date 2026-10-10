import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import {
  childrenByMessage,
  isMessageIndexable,
} from 'omniboxd/messages/entities/message.entity';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { Task, TaskStatus } from 'omniboxd/tasks/tasks.entity';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { In, Repository } from 'typeorm';

const BACKFILL_PAGE_SIZE = 100;

@Injectable()
export class MessageIndexMigrationService {
  constructor(
    private readonly wizardApiService: WizardAPIService,
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    @InjectRepository(Task) private readonly taskRepository: Repository<Task>,
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
  ) {}

  async rebuildMessageIndex(
    namespaceId: string,
    apply: boolean,
    messageIds?: string[],
  ) {
    const report: {
      namespace_id: string;
      scanned: number;
      deleted: number;
      synced: string[];
      skipped: string[];
      failed: string[];
    } = {
      namespace_id: namespaceId,
      scanned: 0,
      deleted: 0,
      synced: [],
      skipped: [],
      failed: [],
    };
    if (apply) {
      const running = await this.taskRepository.countBy({
        namespaceId,
        function: 'upsert_message_index',
        status: TaskStatus.RUNNING,
      });
      if (running)
        throw new AppException(
          'Message index tasks are still running',
          'INDEX_TASKS_RUNNING',
          HttpStatus.CONFLICT,
        );
      if (!messageIds)
        report.deleted = (
          await this.wizardApiService.clearMessageIndex(namespaceId)
        ).deleted;
    }
    let afterId: string | undefined;
    while (true) {
      const conversations = await this.conversationsService.listForMessageIndex(
        namespaceId,
        afterId,
        BACKFILL_PAGE_SIZE,
      );
      if (!conversations.length) break;
      afterId = conversations[conversations.length - 1].id;
      for (const conversation of conversations) {
        if (conversation.namespaceId !== namespaceId || !conversation.userId)
          continue;
        const messages = await this.messagesService.findAll(
          conversation.userId,
          conversation.id,
        );
        const children = childrenByMessage(messages);
        for (const message of messages) {
          if (messageIds && !messageIds.includes(message.id)) continue;
          report.scanned++;
          if (!isMessageIndexable(message, children.get(message.id) || [])) {
            report.skipped.push(message.id);
            continue;
          }
          if (!apply) {
            report.synced.push(message.id);
            continue;
          }
          try {
            const result = await this.wizardApiService.upsertWeaviateMessage({
              namespaceId,
              userId: conversation.userId,
              message: {
                conversationId: conversation.id,
                messageId: message.id,
                message: {
                  role: message.message.role,
                  content: message.message.content || '',
                },
              },
            });
            (result.success ? report.synced : report.failed).push(message.id);
          } catch {
            report.failed.push(message.id);
          }
        }
      }
    }
    return report;
  }

  async rebuildAllMessageIndexes(apply: boolean, namespaceIds?: string[]) {
    if (namespaceIds && namespaceIds.length === 0) {
      throw new AppException(
        'Namespace filter must not be empty',
        'EMPTY_NAMESPACE_FILTER',
        HttpStatus.BAD_REQUEST,
      );
    }
    const namespaces = namespaceIds?.length
      ? await this.namespaceRepository.find({
          select: ['id'],
          where: namespaceIds.map((id) => ({ id })),
          order: { id: 'ASC' },
        })
      : await this.namespaceRepository.find({
          select: ['id'],
          order: { id: 'ASC' },
        });
    const selectedIds = namespaces.map(({ id }) => id);
    if (namespaceIds?.some((id) => !selectedIds.includes(id))) {
      throw new AppException(
        'One or more namespaces were not found',
        'NAMESPACE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    if (apply && selectedIds.length) {
      const running = await this.taskRepository.countBy({
        namespaceId: In(selectedIds),
        function: 'upsert_message_index',
        status: TaskStatus.RUNNING,
      });
      if (running) {
        throw new AppException(
          'Message index tasks are still running',
          'INDEX_TASKS_RUNNING',
          HttpStatus.CONFLICT,
        );
      }
    }

    const reports: Awaited<
      ReturnType<MessageIndexMigrationService['rebuildMessageIndex']>
    >[] = [];
    const errors: { namespace_id: string; error: string }[] = [];
    for (const namespaceId of selectedIds) {
      try {
        reports.push(await this.rebuildMessageIndex(namespaceId, apply));
      } catch (error) {
        errors.push({
          namespace_id: namespaceId,
          error: error instanceof Error ? error.message : 'Migration failed',
        });
      }
    }
    return {
      apply,
      namespace_count: selectedIds.length,
      namespaces: reports,
      errors,
    };
  }
}
