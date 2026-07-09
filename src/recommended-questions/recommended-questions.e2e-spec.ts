import { HttpStatus } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  RecommendedQuestion,
  RecommendedQuestionItem,
} from 'omniboxd/recommended-questions/entities/recommended-question.entity';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
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

      expect(response.body.questions).toHaveLength(items.length);
      expect(response.body.questions).toEqual(
        expect.arrayContaining(
          items.map((item) => ({
            id: item.id,
            question: item.question,
          })),
        ),
      );
      expect(response.body.questions).toEqual(
        response.body.questions.map(
          (item: { id: string; question: string }) => ({
            id: item.id,
            question: item.question,
          }),
        ),
      );
    });

    it('should omit stored questions whose referenced resources are all deleted', async () => {
      const filterClient = await TestClient.create();
      tempClients.push(filterClient);
      const repository: Repository<RecommendedQuestion> = filterClient.app.get(
        getRepositoryToken(RecommendedQuestion),
      );
      const itemRepository: Repository<RecommendedQuestionItem> =
        filterClient.app.get(getRepositoryToken(RecommendedQuestionItem));
      const createResource = async (name: string) => {
        const response = await filterClient
          .post(`/api/v1/namespaces/${filterClient.namespace.id}/resources`)
          .send({
            name,
            namespaceId: filterClient.namespace.id,
            resourceType: ResourceType.DOC,
            parentId: filterClient.namespace.root_resource_id,
            content: 'recommended question resource',
            attrs: {},
          })
          .expect(HttpStatus.CREATED);
        return response.body;
      };

      const activeResource = await createResource(
        'Recommended Questions Active',
      );
      const deletedResource = await createResource(
        'Recommended Questions Deleted',
      );
      await filterClient
        .delete(
          `/api/v1/namespaces/${filterClient.namespace.id}/resources/${deletedResource.id}`,
        )
        .expect(HttpStatus.OK);

      const now = new Date();
      const record = await repository.save({
        namespaceId: filterClient.namespace.id,
        userId: filterClient.user.id,
        scannedAt: now,
        generatedAt: now,
      });
      const items = await itemRepository.save([
        itemRepository.create({
          recommendedQuestionId: record.id,
          question: 'What should I ask with no resources?',
          meta: {
            intent: 'explore',
            reason: 'No resource references',
          },
        }),
        itemRepository.create({
          recommendedQuestionId: record.id,
          question: 'What should I ask about the active resource?',
          meta: {
            intent: 'explore',
            reason: 'Active resource reference',
            resourceIds: [activeResource.id],
          },
        }),
        itemRepository.create({
          recommendedQuestionId: record.id,
          question: 'What should I ask about the deleted resource?',
          meta: {
            intent: 'explore',
            reason: 'Deleted resource reference',
            resourceIds: [deletedResource.id],
          },
        }),
        itemRepository.create({
          recommendedQuestionId: record.id,
          question: 'What should I ask about mixed resources?',
          meta: {
            intent: 'explore',
            reason: 'Mixed resource references',
            resourceIds: [deletedResource.id, activeResource.id],
          },
        }),
      ]);

      const response = await filterClient
        .get(
          `/api/v1/namespaces/${filterClient.namespace.id}/recommended-questions`,
        )
        .expect(HttpStatus.OK);

      expect(response.body.questions).toEqual([
        {
          id: items[0].id,
          question: items[0].question,
        },
        {
          id: items[1].id,
          question: items[1].question,
        },
        {
          id: items[3].id,
          question: items[3].question,
        },
      ]);
      expect(response.body.questions).not.toContainEqual({
        id: items[2].id,
        question: items[2].question,
      });
      expect(response.body.questions).toEqual(
        response.body.questions.map(
          (item: { id: string; question: string }) => ({
            id: item.id,
            question: item.question,
          }),
        ),
      );
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
