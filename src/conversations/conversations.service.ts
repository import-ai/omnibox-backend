import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import { UserService } from 'omniboxd/user/user.service';
import { ConfigService } from '@nestjs/config';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { WizardAPIService } from 'omniboxd/wizard/api.wizard.service';
import {
  ConversationDetailDto,
  ConversationMessageMappingDto,
} from 'omniboxd/conversations/dto/conversation-detail.dto';
import { ConversationSummaryDto } from 'omniboxd/conversations/dto/conversation-summary.dto';
import {
  Message,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { Share } from 'omniboxd/shares/entities/share.entity';

const TASK_PRIORITY = 5;

@Injectable()
export class ConversationsService {
  private readonly wizardApiService: WizardAPIService;

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    private readonly dataSource: DataSource,
    private readonly messagesService: MessagesService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly wizardTaskService: WizardTaskService,
    private readonly i18n: I18nService,
  ) {
    const baseUrl = this.configService.get<string>('OBB_WIZARD_BASE_URL');
    if (!baseUrl) {
      const message = this.i18n.t('system.errors.missingWizardBaseUrl');
      throw new AppException(
        message,
        'MISSING_WIZARD_BASE_URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.wizardApiService = new WizardAPIService(baseUrl, this.i18n);
  }

  async create(namespaceId: string, user: User) {
    const conversation = this.conversationRepository.create({
      namespaceId,
      userId: user.id,
      title: '',
    });
    return await this.conversationRepository.save(conversation);
  }

  async createConversationForShare(share: Share) {
    const conversation = this.conversationRepository.create({
      namespaceId: share.namespaceId,
      userId: null,
      title: '',
      shareId: share.id,
    });
    return await this.conversationRepository.save(conversation);
  }

  async update(id: string, title: string) {
    const conversation = await this.findOne(id);
    conversation.title = title;
    await this.conversationRepository.save(conversation);
  }

  async findAll(
    namespaceId: string,
    userId: string,
    options?: { limit?: number; offset?: number; order?: string },
  ) {
    const query: any = {
      where: { namespaceId, userId },
      order: {
        updatedAt: options?.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      },
    };
    if (options?.limit) query.take = Number(options.limit);
    if (options?.offset) query.skip = Number(options.offset);
    return await this.conversationRepository.find(query);
  }

  async countAll(namespaceId: string, userId: string) {
    return await this.conversationRepository.countBy({
      namespaceId,
      userId,
    });
  }

  async compose(
    userId: string,
    conversationId: string,
    lastMessageId: string | null = null,
  ) {
    const messages: Message[] = await this.messagesService.findAll(
      userId,
      conversationId,
    );
    if (messages.length === 0) {
      return [];
    }
    if (!lastMessageId) {
      const lastMessage = messages[messages.length - 1];
      lastMessageId = lastMessage.id;
    }
    const composed: Message[] = [];
    while (lastMessageId) {
      const message = messages.find((message) => message.id === lastMessageId);
      if (!message) {
        const errorMessage = this.i18n.t('system.errors.messageNotFound');
        throw new AppException(
          errorMessage,
          'MESSAGE_NOT_FOUND',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      composed.unshift(message);
      lastMessageId = message.parentId;
    }
    return composed;
  }

  async createTitle(id: string, userId: string): Promise<{ title: string }> {
    const conversation = await this.conversationRepository.findOneOrFail({
      where: { id, userId },
    });
    if (conversation.title) {
      return { title: conversation.title };
    }
    const summary = await this.getSummary(userId, conversation);
    if (summary.user_content) {
      const content = summary.user_content.trim();
      if (content.length > 0) {
        const currentLanguage = I18nContext.current()?.lang;
        const lang = currentLanguage?.includes('zh') ? '简体中文' : 'English';
        const titleCreateResponse = await this.wizardApiService.request(
          'POST',
          '/internal/api/v1/wizard/title',
          {
            text: content,
            lang,
          },
        );
        conversation.title = titleCreateResponse.title!;
        await this.conversationRepository.save(conversation);
        return titleCreateResponse as { title: string };
      }
    }
    const message = this.i18n.t('system.errors.noQueryContent');
    throw new AppException(
      message,
      'NO_QUERY_CONTENT',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async getSummary(
    userId: string,
    c: Conversation,
  ): Promise<ConversationSummaryDto> {
    const messages: Message[] = await this.compose(userId, c.id);
    const check = (m: Message, role: OpenAIMessageRole) => {
      return m.message.role === role && m.message.content?.trim();
    };
    return {
      id: c.id,
      title: c.title,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt?.toISOString(),
      user_content: messages.find((m) => check(m, OpenAIMessageRole.USER))
        ?.message?.content,
      assistant_content: messages.find((m) =>
        check(m, OpenAIMessageRole.ASSISTANT),
      )?.message?.content,
    };
  }

  async listSummary(
    namespaceId: string,
    userId: string,
    options?: { limit?: number; offset?: number; order?: string },
  ): Promise<{
    total: number;
    data: ConversationSummaryDto[];
  }> {
    const conversations = await this.findAll(namespaceId, userId, options);
    const summaries: ConversationSummaryDto[] = await Promise.all(
      conversations.map((c) => this.getSummary(userId, c)),
    );
    const summariesTotal = await this.countAll(namespaceId, userId);
    return {
      data: summaries,
      total: summariesTotal,
    };
  }

  private convertToConversationDetail(
    conversation: Conversation,
    messages: Message[],
  ): ConversationDetailDto {
    const detail: ConversationDetailDto = {
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.createdAt.toISOString(),
      updated_at: conversation.updatedAt?.toISOString(),
      mapping: {},
    };
    if (messages.length === 0) {
      return detail;
    }

    const childrenMap: Record<string, string[]> = {};
    for (const msg of messages) {
      if (msg.message.role === OpenAIMessageRole.SYSTEM) {
        continue;
      }
      if (msg.parentId) {
        if (!childrenMap[msg.parentId]) {
          childrenMap[msg.parentId] = [];
        }
        childrenMap[msg.parentId].push(msg.id);
      }
    }
    for (const msg of messages) {
      if (msg.message.role === OpenAIMessageRole.SYSTEM) {
        continue;
      }
      detail.mapping[msg.id] = {
        id: msg.id,
        message: msg.message,
        parent_id: msg.parentId,
        children: childrenMap[msg.id] || [],
        created_at: msg.createdAt.toISOString(),
        status: msg.status,
        attrs: msg.attrs,
      } as ConversationMessageMappingDto;
    }
    if (messages.length > 0) {
      detail.current_node = messages[messages.length - 1].id;
    }
    return detail;
  }

  async getConversationForUser(
    conversationId: string,
    user: User,
  ): Promise<ConversationDetailDto> {
    const conversation = await this.conversationRepository.findOneOrFail({
      where: { id: conversationId, userId: user.id },
    });
    const messages = await this.messagesService.findAll(
      user.id,
      conversation.id,
    );
    return this.convertToConversationDetail(conversation, messages);
  }

  async getConversationForShare(
    conversationId: string,
    share: Share,
  ): Promise<ConversationDetailDto> {
    const conversation = await this.conversationRepository.findOneOrFail({
      where: { id: conversationId, shareId: share.id },
    });
    const messages = await this.messagesService.findAll(
      undefined,
      conversation.id,
    );
    return this.convertToConversationDetail(conversation, messages);
  }

  async findOne(id: string) {
    return await this.conversationRepository.findOneOrFail({
      where: { id },
    });
  }

  async remove(namespaceId: string, userId: string, conversationId: string) {
    await this.dataSource.transaction(async (manager) => {
      await this.wizardTaskService.deleteConversationTask(
        namespaceId,
        userId,
        conversationId,
        TASK_PRIORITY,
        manager.getRepository(Task),
      );
      return await manager.softDelete(Conversation, {
        namespaceId,
        userId,
        id: conversationId,
      });
    });
  }

  async restore(namespaceId: string, userId: string, conversationId: string) {
    const messages = await this.messagesService.findAll(userId, conversationId);
    return await this.dataSource.transaction(async (manager) => {
      const taskRepo = manager.getRepository(Task);
      for (const message of messages) {
        await this.wizardTaskService.createMessageIndexTask(
          TASK_PRIORITY,
          userId,
          namespaceId,
          conversationId,
          message,
          taskRepo,
        );
      }
      await manager.restore(Conversation, {
        namespaceId,
        userId,
        id: conversationId,
      });
      return await manager.findOne(Conversation, {
        where: { namespaceId, userId, id: conversationId },
      });
    });
  }

  async get(id: string) {
    return await this.conversationRepository.findOne({
      where: { id },
    });
  }

  async has(id: string) {
    return await this.conversationRepository.exists({
      where: { id },
    });
  }

  async listAll(offset: number, limit: number) {
    return await this.conversationRepository.find({
      skip: offset,
      take: limit,
    });
  }
}
