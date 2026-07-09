import { Expose, Type } from 'class-transformer';
import { RecommendedQuestionPayload } from 'omniboxd/recommended-questions/entities/recommended-question.entity';

export class RecommendTagDto {
  @Expose({ name: 'id' })
  id?: string;

  @Expose({ name: 'name' })
  name: string;
}

export class RecommendResourceDto {
  @Expose({ name: 'id' })
  id?: string;

  @Expose({ name: 'name' })
  name: string;

  @Expose({ name: 'resource_type' })
  resourceType?: string;

  @Expose({ name: 'metadata' })
  metadata: Record<string, any> = {};

  @Expose({ name: 'tags' })
  @Type(() => RecommendTagDto)
  tags: RecommendTagDto[] = [];

  @Expose({ name: 'content' })
  content: string;

  @Expose({ name: 'created_at' })
  createdAt?: string;

  @Expose({ name: 'updated_at' })
  updatedAt?: string;
}

export class RecentQuestionDto {
  @Expose({ name: 'conversation_id' })
  conversationId?: string;

  @Expose({ name: 'question' })
  question: string;

  @Expose({ name: 'is_recommended' })
  isRecommended: boolean = false;
}

export class RecommendQuestionsContextDto {
  @Expose({ name: 'recent_resources' })
  @Type(() => RecommendResourceDto)
  recentResources: RecommendResourceDto[] = [];

  @Expose({ name: 'recent_tags' })
  @Type(() => RecommendTagDto)
  recentTags: RecommendTagDto[] = [];

  @Expose({ name: 'recent_questions' })
  @Type(() => RecentQuestionDto)
  recentQuestions: RecentQuestionDto[] = [];
}

export class RecommendQuestionsRequestDto {
  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  @Expose({ name: 'user_id' })
  userId: string;

  @Expose({ name: 'context' })
  @Type(() => RecommendQuestionsContextDto)
  context: RecommendQuestionsContextDto;

  @Expose({ name: 'max_questions' })
  maxQuestions?: number;
}

export class RecommendedQuestionDto implements RecommendedQuestionPayload {
  @Expose({ name: 'question' })
  question: string;

  @Expose({ name: 'intent' })
  intent: string;

  @Expose({ name: 'reason' })
  reason: string;

  @Expose({ name: 'resource_ids' })
  resourceIds: string[] = [];

  @Expose({ name: 'tag_ids' })
  tagIds: string[] = [];

  @Expose({ name: 'conversation_ids' })
  conversationIds: string[] = [];
}

export class RecommendQuestionsResponseDto {
  @Expose({ name: 'questions' })
  @Type(() => RecommendedQuestionDto)
  questions: RecommendedQuestionDto[];
}
