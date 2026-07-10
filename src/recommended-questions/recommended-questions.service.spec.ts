import { RecommendedQuestionsService } from 'omniboxd/recommended-questions/recommended-questions.service';

describe('RecommendedQuestionsService', () => {
  const namespaceId = 'namespace-1';
  const userId = 'user-1';

  function createService() {
    const namespaceResourcesService = {
      getRecentResources: jest.fn().mockResolvedValue([]),
      getAllResourcesByUser: jest.fn().mockResolvedValue([]),
      getTagsForResources: jest.fn().mockResolvedValue(new Map()),
    };
    const tagService = {
      getRecentTags: jest.fn().mockResolvedValue([]),
      getRecentTagsByIds: jest.fn().mockResolvedValue([]),
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

    return { namespaceResourcesService, service, tagService, wizardApiService };
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

    it('passes only recent tags attached to visible resources', async () => {
      const {
        namespaceResourcesService,
        service,
        tagService,
        wizardApiService,
      } = createService();
      namespaceResourcesService.getAllResourcesByUser.mockResolvedValue([
        { id: 'visible-1', tagIds: ['tag-visible', 'tag-shared'] },
        { id: 'visible-2', tagIds: ['tag-shared'] },
      ]);
      tagService.getRecentTagsByIds.mockResolvedValue([
        { id: 'tag-visible', name: 'Visible' },
        { id: 'tag-shared', name: 'Shared' },
      ]);

      await service.generateQuestions(namespaceId, userId);

      expect(tagService.getRecentTagsByIds).toHaveBeenCalledWith(
        namespaceId,
        ['tag-visible', 'tag-shared'],
        10,
      );
      expect(wizardApiService.recommendQuestions).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            recentTags: [
              expect.objectContaining({ id: 'tag-visible', name: 'Visible' }),
              expect.objectContaining({ id: 'tag-shared', name: 'Shared' }),
            ],
          }),
        }),
      );
    });

    it('sends no recent tags when the user has no visible tagged resources', async () => {
      const { service, tagService, wizardApiService } = createService();

      await service.generateQuestions(namespaceId, userId);

      expect(tagService.getRecentTagsByIds).toHaveBeenCalledWith(
        namespaceId,
        [],
        10,
      );
      expect(wizardApiService.recommendQuestions).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            recentTags: [],
          }),
        }),
      );
    });
  });
});
