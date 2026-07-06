import { Injectable } from '@nestjs/common';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import {
  RecommendQuestionsContextDto,
  RecommendQuestionsRequestDto,
  RecommendQuestionsResponseDto,
} from 'omniboxd/wizard/dto/recommend-questions.dto';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';

const RECENT_RESOURCES_COUNT = 5;
const RECENT_TAGS_COUNT = 10;
const RECENT_QUESTIONS_COUNT = 5;
const DEFAULT_MAX_QUESTIONS = 3;

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
    context.recentResources = resources
      .map((r) => r.name?.trim())
      .filter((name): name is string => !!name);
    context.recentTags = tags.map((t) => t.name);
    context.recentQuestions = questions;

    const req = new RecommendQuestionsRequestDto();
    req.namespaceId = namespaceId;
    req.userId = userId;
    req.context = context;
    req.maxQuestions = maxQuestions;

    return await this.wizardApiService.recommendQuestions(req);
  }
}
