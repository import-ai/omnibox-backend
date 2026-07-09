import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import {
  RecentQuestionDto,
  RecommendQuestionsContextDto,
  RecommendQuestionsRequestDto,
  RecommendQuestionsResponseDto,
  RecommendResourceDto,
  RecommendTagDto,
} from 'omniboxd/recommended-questions/dto/recommend-questions.dto';
import {
  RecommendedQuestion,
  RecommendedQuestionItem,
} from 'omniboxd/recommended-questions/entities/recommended-question.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { TagService } from 'omniboxd/tag/tag.service';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { Repository } from 'typeorm';

const RECENT_RESOURCES_COUNT = 5;
const RECENT_TAGS_COUNT = 10;
const RECENT_QUESTIONS_COUNT = 5;
const DEFAULT_MAX_QUESTIONS = 3;
const RESOURCE_CONTENT_MAX_LENGTH = 500;

@Injectable()
export class RecommendedQuestionsService {
  constructor(
    @InjectRepository(RecommendedQuestion)
    private readonly recommendedQuestionsRepository: Repository<RecommendedQuestion>,
    @InjectRepository(RecommendedQuestionItem)
    private readonly recommendedQuestionItemsRepository: Repository<RecommendedQuestionItem>,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly tagService: TagService,
    private readonly conversationsService: ConversationsService,
    private readonly wizardApiService: WizardAPIService,
  ) {}

  async getQuestions(
    namespaceId: string,
    userId: string,
  ): Promise<{ question: string }[]> {
    const record = await this.recommendedQuestionsRepository.findOne({
      where: { namespaceId, userId },
    });
    if (!record) {
      return [];
    }

    const items = await this.recommendedQuestionItemsRepository.find({
      where: { recommendedQuestionId: record.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return items.map((item) => ({ question: item.question }));
  }

  async generateQuestions(
    namespaceId: string,
    userId: string,
    maxQuestions: number = DEFAULT_MAX_QUESTIONS,
  ): Promise<RecommendQuestionsResponseDto> {
    const [resources, tags, questions] = await Promise.all([
      this.namespaceResourcesService.getRecentResources(
        namespaceId,
        userId,
        RECENT_RESOURCES_COUNT,
      ),
      this.tagService.getRecentTags(namespaceId, RECENT_TAGS_COUNT),
      this.conversationsService.getRecentQuestions(
        namespaceId,
        userId,
        RECENT_QUESTIONS_COUNT,
      ),
    ]);

    const context = new RecommendQuestionsContextDto();
    context.recentResources = await this.toRecommendResources(
      namespaceId,
      resources,
    );
    context.recentTags = tags.map((t) => this.toRecommendTag(t.id, t.name));
    context.recentQuestions = questions.map((q) => {
      const dto = new RecentQuestionDto();
      dto.conversationId = q.conversationId;
      dto.question = q.question;
      dto.isRecommended = q.isRecommended;
      return dto;
    });

    const req = new RecommendQuestionsRequestDto();
    req.namespaceId = namespaceId;
    req.userId = userId;
    req.context = context;
    req.maxQuestions = maxQuestions;

    return await this.wizardApiService.recommendQuestions(req);
  }

  private async toRecommendResources(
    namespaceId: string,
    resources: Resource[],
  ): Promise<RecommendResourceDto[]> {
    const tagsByResource =
      await this.namespaceResourcesService.getTagsForResources(
        namespaceId,
        resources,
      );

    return resources
      .map((resource) => {
        const dto = new RecommendResourceDto();
        dto.id = resource.id;
        dto.name = resource.name?.trim() ?? '';
        dto.resourceType = resource.resourceType;
        dto.metadata = { ...resource.attrs };
        delete dto.metadata.transcript;
        delete dto.metadata.video_info;
        dto.tags = (tagsByResource.get(resource.id) ?? []).map((t) =>
          this.toRecommendTag(t.id, t.name),
        );
        dto.content = this.truncateContent(resource.content);
        dto.createdAt = resource.createdAt?.toISOString();
        dto.updatedAt = resource.updatedAt?.toISOString();
        return dto;
      })
      .filter((dto) => dto.name.length > 0 || dto.content.length > 0);
  }

  private toRecommendTag(
    id: string | undefined,
    name: string,
  ): RecommendTagDto {
    const dto = new RecommendTagDto();
    dto.id = id;
    dto.name = name;
    return dto;
  }

  private truncateContent(content: string | null | undefined): string {
    const trimmed = content?.trim() ?? '';
    if (trimmed.length <= RESOURCE_CONTENT_MAX_LENGTH) {
      return trimmed;
    }
    return `${trimmed.slice(0, RESOURCE_CONTENT_MAX_LENGTH)}…`;
  }
}
