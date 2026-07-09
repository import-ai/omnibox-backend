import { Controller, Get, Param } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { RecommendedQuestionsService } from 'omniboxd/recommended-questions/recommended-questions.service';

@Controller('api/v1/namespaces/:namespaceId/recommended-questions')
export class RecommendedQuestionsController {
  constructor(
    private readonly recommendedQuestionsService: RecommendedQuestionsService,
  ) {}

  @Get()
  async getRecommendedQuestions(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
  ): Promise<{ questions: { id: string; question: string }[] }> {
    const questions = await this.recommendedQuestionsService.getQuestions(
      namespaceId,
      userId,
    );
    return { questions };
  }
}
