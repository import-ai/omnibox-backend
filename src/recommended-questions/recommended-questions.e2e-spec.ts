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

    it('should return at most three stored questions with unclicked questions first', async () => {
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
          clicked: false,
        },
        {
          question: 'How to improve home network stability?',
          intent: 'troubleshoot',
          reason: 'Based on recent conversations',
          clicked: false,
        },
        {
          question: 'How should I tag router docs?',
          intent: 'organize',
          reason: 'Based on recent tags',
          clicked: false,
        },
        {
          question: 'What did I ask about DNS?',
          intent: 'recall',
          reason: 'Based on clicked recommendations',
          clicked: true,
        },
        {
          question: 'How do I debug Wi-Fi roaming?',
          intent: 'troubleshoot',
          reason: 'Based on clicked recommendations',
          clicked: true,
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
            clicked: q.clicked,
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

      expect(response.body.questions).toHaveLength(3);
      expect(response.body.questions).toEqual(
        expect.arrayContaining(
          items.slice(0, 3).map((item) => ({
            id: item.id,
            question: item.question,
          })),
        ),
      );
      expect(response.body.questions).not.toEqual(
        expect.arrayContaining(
          items.slice(3).map((item) => ({
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

    it('should place unclicked questions before clicked questions when both are returned', async () => {
      const priorityClient = await TestClient.create();
      tempClients.push(priorityClient);
      const repository: Repository<RecommendedQuestion> =
        priorityClient.app.get(getRepositoryToken(RecommendedQuestion));
      const itemRepository: Repository<RecommendedQuestionItem> =
        priorityClient.app.get(getRepositoryToken(RecommendedQuestionItem));
      const now = new Date();
      const record = await repository.save({
        namespaceId: priorityClient.namespace.id,
        userId: priorityClient.user.id,
        scannedAt: now,
        generatedAt: now,
      });
      const items = await itemRepository.save([
        itemRepository.create({
          recommendedQuestionId: record.id,
          question: 'Unclicked recommendation A',
          clicked: false,
          meta: {
            intent: 'explore',
            reason: 'Unclicked recommendation',
          },
        }),
        itemRepository.create({
          recommendedQuestionId: record.id,
          question: 'Clicked recommendation A',
          clicked: true,
          meta: {
            intent: 'explore',
            reason: 'Clicked recommendation',
          },
        }),
        itemRepository.create({
          recommendedQuestionId: record.id,
          question: 'Unclicked recommendation B',
          clicked: false,
          meta: {
            intent: 'explore',
            reason: 'Unclicked recommendation',
          },
        }),
        itemRepository.create({
          recommendedQuestionId: record.id,
          question: 'Clicked recommendation B',
          clicked: true,
          meta: {
            intent: 'explore',
            reason: 'Clicked recommendation',
          },
        }),
      ]);
      const clickedById = new Map(items.map((item) => [item.id, item.clicked]));

      const response = await priorityClient
        .get(
          `/api/v1/namespaces/${priorityClient.namespace.id}/recommended-questions`,
        )
        .expect(HttpStatus.OK);

      expect(response.body.questions).toHaveLength(3);
      expect(response.body.questions).toEqual(
        expect.arrayContaining(
          items
            .filter((item) => !item.clicked)
            .map((item) => ({
              id: item.id,
              question: item.question,
            })),
        ),
      );
      const clickedFlags = response.body.questions.map((item: { id: string }) =>
        clickedById.get(item.id),
      );
      expect(clickedFlags).toEqual([false, false, true]);
    });

    it('should omit stored questions with any deleted referenced resource', async () => {
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
          question: 'What should I ask about the deleted resource?',
          meta: {
            intent: 'explore',
            reason: 'Deleted resource reference',
            resourceIds: [deletedResource.id],
          },
        }),
        itemRepository.create({
          recommendedQuestionId: record.id,
          question: 'What should I ask about another deleted resource?',
          meta: {
            intent: 'explore',
            reason: 'Deleted resource reference',
            resourceIds: [deletedResource.id],
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

      expect(response.body.questions).toHaveLength(2);
      expect(response.body.questions).toEqual(
        expect.arrayContaining(
          [items[0], items[3]].map((item) => ({
            id: item.id,
            question: item.question,
          })),
        ),
      );
      expect(response.body.questions).toEqual(
        expect.not.arrayContaining(
          [items[1], items[2], items[4]].map((item) => ({
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
