import { Expose, Type } from 'class-transformer';
import { RecommendedQuestionItem } from 'omniboxd/recommended-questions/entities/recommended-question.entity';

export class RecommendResourceDto {
  @Expose({ name: 'name' })
  name: string;

  @Expose({ name: 'resource_type' })
  resourceType?: string;

  @Expose({ name: 'metadata' })
  metadata: Record<string, any> = {};

  @Expose({ name: 'tags' })
  tags: string[] = [];

  @Expose({ name: 'content' })
  content: string;

  @Expose({ name: 'created_at' })
  createdAt?: string;

  @Expose({ name: 'updated_at' })
  updatedAt?: string;
}

export class RecentQuestionDto {
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
  recentTags: string[] = [];

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

export class RecommendedQuestionDto implements RecommendedQuestionItem {
  @Expose({ name: 'question' })
  question: string;

  @Expose({ name: 'intent' })
  intent: string;

  @Expose({ name: 'reason' })
  reason: string;
}

export class RecommendQuestionsResponseDto {
  @Expose({ name: 'questions' })
  @Type(() => RecommendedQuestionDto)
  questions: RecommendedQuestionDto[];
}
