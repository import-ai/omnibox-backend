import { Injectable } from '@nestjs/common';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { TagService } from 'omniboxd/tag/tag.service';
import {
  RecommendQuestionsContextDto,
  RecommendQuestionsRequestDto,
  RecommendQuestionsResponseDto,
  RecommendResourceDto,
} from 'omniboxd/wizard/dto/recommend-questions.dto';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';

const RECENT_RESOURCES_COUNT = 5;
const RECENT_TAGS_COUNT = 10;
const RECENT_QUESTIONS_COUNT = 5;
const DEFAULT_MAX_QUESTIONS = 3;
const RESOURCE_CONTENT_MAX_LENGTH = 500;

@Injectable()
export class RecommendedQuestionsService {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly tagService: TagService,
    private readonly conversationsService: ConversationsService,
    private readonly wizardApiService: WizardAPIService,
  ) {}

  async getRecommendedQuestions(
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
    context.recentTags = tags.map((t) => t.name);
    context.recentQuestions = questions;

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
    const tagIds = [...new Set(resources.flatMap((r) => r.tagIds ?? []))];
    const tagNameById = new Map(
      (await this.tagService.getTagsByIds(namespaceId, tagIds)).map((t) => [
        t.id,
        t.name,
      ]),
    );

    return resources
      .map((resource) => {
        const dto = new RecommendResourceDto();
        dto.name = resource.name?.trim() ?? '';
        dto.resourceType = resource.resourceType;
        dto.metadata = { ...resource.attrs };
        delete dto.metadata.transcript;
        delete dto.metadata.video_info;
        dto.tags = (resource.tagIds ?? [])
          .map((id) => tagNameById.get(id))
          .filter((name): name is string => !!name);
        dto.content = this.truncateContent(resource.content);
        dto.createdAt = resource.createdAt?.toISOString();
        dto.updatedAt = resource.updatedAt?.toISOString();
        return dto;
      })
      .filter((dto) => dto.name.length > 0 || dto.content!.length > 0);
  }

  private truncateContent(content: string | null | undefined): string {
    const trimmed = content?.trim() ?? '';
    if (trimmed.length <= RESOURCE_CONTENT_MAX_LENGTH) {
      return trimmed;
    }
    return `${trimmed.slice(0, RESOURCE_CONTENT_MAX_LENGTH)}…`;
  }
}
