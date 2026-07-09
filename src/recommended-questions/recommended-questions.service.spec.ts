import { RecommendedQuestionsService } from 'omniboxd/recommended-questions/recommended-questions.service';

describe('RecommendedQuestionsService', () => {
  const namespaceId = 'namespace-1';
  const userId = 'user-1';

  function createService() {
    const namespaceResourcesService = {
      getRecentResources: jest.fn().mockResolvedValue([]),
      getTagsForResources: jest.fn().mockResolvedValue(new Map()),
    };
    const tagService = {
      getRecentTags: jest.fn().mockResolvedValue([]),
    };
    const conversationsService = {
      getRecentQuestions: jest.fn().mockResolvedValue([]),
    };
    const wizardApiService = {
      recommendQuestions: jest.fn().mockResolvedValue({ questions: [] }),
    };
    const service = new RecommendedQuestionsService(
      {} as any,
      {} as any,
      namespaceResourcesService as any,
      {} as any,
      tagService as any,
      conversationsService as any,
      wizardApiService as any,
    );

    return { service, wizardApiService };
  }

  describe('generateQuestions', () => {
    it('uses 10 as the default max questions', async () => {
      const { service, wizardApiService } = createService();

      await service.generateQuestions(namespaceId, userId);

      expect(wizardApiService.recommendQuestions).toHaveBeenCalledWith(
        expect.objectContaining({
          namespaceId,
          userId,
          maxQuestions: 10,
        }),
      );
    });

    it('passes through an explicit max questions value', async () => {
      const { service, wizardApiService } = createService();

      await service.generateQuestions(namespaceId, userId, 4);

      expect(wizardApiService.recommendQuestions).toHaveBeenCalledWith(
        expect.objectContaining({
          namespaceId,
          userId,
          maxQuestions: 4,
        }),
      );
    });
  });
});
