import { Expose, Type } from 'class-transformer';

export class RecommendQuestionsContextDto {
  @Expose({ name: 'recent_resources' })
  recentResources: string[] = [];

  @Expose({ name: 'recent_tags' })
  recentTags: string[] = [];

  @Expose({ name: 'recent_questions' })
  recentQuestions: string[] = [];
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

export class RecommendedQuestionDto {
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
