import { HttpStatus } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  RecommendedQuestion,
  RecommendedQuestionItem,
} from 'omniboxd/recommended-questions/entities/recommended-question.entity';
import { TestClient } from 'test/test-client';
import { Repository } from 'typeorm';

describe('RecommendedQuestionsController (e2e)', () => {
  let client: TestClient;
  const tempClients: TestClient[] = [];

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
    for (const tempClient of tempClients) {
      await tempClient.close();
    }
  });

  describe('GET /api/v1/namespaces/:namespaceId/recommended-questions', () => {
    it('should return empty questions when no record exists', async () => {
      const response = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/recommended-questions`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({ questions: [] });
    });

    it('should return stored questions', async () => {
      const repository: Repository<RecommendedQuestion> = client.app.get(
        getRepositoryToken(RecommendedQuestion),
      );
      const itemRepository: Repository<RecommendedQuestionItem> =
        client.app.get(getRepositoryToken(RecommendedQuestionItem));
      const now = new Date();
      const questions = [
        {
          question: 'What is OpenWrt?',
          intent: 'explore',
          reason: 'Based on recent resources',
        },
        {
          question: 'How to improve home network stability?',
          intent: 'troubleshoot',
          reason: 'Based on recent conversations',
        },
      ];
      const record = await repository.save({
        namespaceId: client.namespace.id,
        userId: client.user.id,
        scannedAt: now,
        generatedAt: now,
      });
      const items = await itemRepository.save(
        questions.map((q) =>
          itemRepository.create({
            recommendedQuestionId: record.id,
            question: q.question,
            meta: {
              intent: q.intent,
              reason: q.reason,
            },
          }),
        ),
      );

      const response = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/recommended-questions`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        questions: items.map((item) => ({
          id: item.id,
          question: item.question,
        })),
      });
    });

    it("should not return another user's questions", async () => {
      const anotherClient = await TestClient.create();
      tempClients.push(anotherClient);

      const response = await anotherClient
        .get(`/api/v1/namespaces/${client.namespace.id}/recommended-questions`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({ questions: [] });
    });

    it('should fail without authentication token', async () => {
      await client
        .request()
        .get(`/api/v1/namespaces/${client.namespace.id}/recommended-questions`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});
