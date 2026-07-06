import { RecommendQuestionsRequestDto } from 'omniboxd/wizard/dto/recommend-questions.dto';

import { RecommendedQuestionsService } from './recommended-questions.service';

describe('RecommendedQuestionsService', () => {
  describe('getRecommendedQuestions', () => {
    it('aggregates recent activity and passes it to the wizard API', async () => {
      const namespaceResourcesService = {
        getRecentResources: jest
          .fn()
          .mockResolvedValue([
            { name: 'AI 知识库搭建方案' },
            { name: '  RAG 实践笔记  ' },
            { name: '' },
            { name: undefined },
          ]),
      };
      const tagService = {
        getRecentTags: jest
          .fn()
          .mockResolvedValue([{ name: '技术' }, { name: '笔记' }]),
      };
      const conversationsService = {
        getRecentQuestions: jest
          .fn()
          .mockResolvedValue(['RAG 和微调有什么区别？']),
      };
      const wizardResponse = {
        questions: [
          {
            question: '帮我把 AI 知识库相关资源都打上 AI 知识库标签',
            intent: 'tag_operation',
            reason: '用户近期有多个 AI 知识库相关资源',
          },
        ],
      };
      const wizardApiService = {
        recommendQuestions: jest.fn().mockResolvedValue(wizardResponse),
      };
      const service = new RecommendedQuestionsService(
        namespaceResourcesService as any,
        tagService as any,
        conversationsService as any,
        wizardApiService as any,
      );

      const result = await service.getRecommendedQuestions(
        'namespace-id',
        'user-id',
      );

      expect(namespaceResourcesService.getRecentResources).toHaveBeenCalledWith(
        'namespace-id',
        'user-id',
        5,
      );
      expect(tagService.getRecentTags).toHaveBeenCalledWith('namespace-id', 10);
      expect(conversationsService.getRecentQuestions).toHaveBeenCalledWith(
        'namespace-id',
        'user-id',
        5,
      );
      expect(wizardApiService.recommendQuestions).toHaveBeenCalledTimes(1);
      const req: RecommendQuestionsRequestDto =
        wizardApiService.recommendQuestions.mock.calls[0][0];
      expect(req.namespaceId).toBe('namespace-id');
      expect(req.userId).toBe('user-id');
      expect(req.maxQuestions).toBe(3);
      expect(req.context.recentResources).toEqual([
        'AI 知识库搭建方案',
        'RAG 实践笔记',
      ]);
      expect(req.context.recentTags).toEqual(['技术', '笔记']);
      expect(req.context.recentQuestions).toEqual(['RAG 和微调有什么区别？']);
      expect(result).toBe(wizardResponse);
    });

    it('passes an explicit maxQuestions through to the request', async () => {
      const namespaceResourcesService = {
        getRecentResources: jest.fn().mockResolvedValue([]),
      };
      const tagService = { getRecentTags: jest.fn().mockResolvedValue([]) };
      const conversationsService = {
        getRecentQuestions: jest.fn().mockResolvedValue([]),
      };
      const wizardApiService = {
        recommendQuestions: jest.fn().mockResolvedValue({ questions: [] }),
      };
      const service = new RecommendedQuestionsService(
        namespaceResourcesService as any,
        tagService as any,
        conversationsService as any,
        wizardApiService as any,
      );

      await service.getRecommendedQuestions('namespace-id', 'user-id', 5);

      const req: RecommendQuestionsRequestDto =
        wizardApiService.recommendQuestions.mock.calls[0][0];
      expect(req.maxQuestions).toBe(5);
      expect(req.context.recentResources).toEqual([]);
      expect(req.context.recentTags).toEqual([]);
      expect(req.context.recentQuestions).toEqual([]);
    });
  });
});
