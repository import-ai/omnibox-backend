import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { trace } from '@opentelemetry/api';
import { Span } from 'nestjs-otel';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import {
  RecommendedQuestion,
  RecommendedQuestionItem,
} from 'omniboxd/recommended-questions/entities/recommended-question.entity';
import { RecommendedQuestionsService } from 'omniboxd/recommended-questions/recommended-questions.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { QueryFailedError, Repository } from 'typeorm';

const SCAN_FRESHNESS_MS = 10 * 60 * 1000;
const NAMESPACE_BATCH_SIZE = 100;

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string } | undefined)?.code ===
      PG_UNIQUE_VIOLATION
  );
}

function maxDate(...dates: (Date | undefined)[]): Date | undefined {
  let max: Date | undefined;
  for (const date of dates) {
    if (date && (!max || date > max)) {
      max = date;
    }
  }
  return max;
}

@Injectable()
export class RecommendedQuestionsCronService {
  private readonly logger = new Logger(RecommendedQuestionsCronService.name);

  constructor(
    @InjectRepository(RecommendedQuestion)
    private readonly recommendedQuestionsRepository: Repository<RecommendedQuestion>,
    private readonly namespacesService: NamespacesService,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly tagService: TagService,
    private readonly conversationsService: ConversationsService,
    private readonly recommendedQuestionsService: RecommendedQuestionsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  @Span('RecommendedQuestionsCronService.scan')
  async scan(): Promise<void> {
    const counts = {
      namespaces: 0,
      members: 0,
      generated: 0,
      failed: 0,
    };
    for (let offset = 0; ; offset += NAMESPACE_BATCH_SIZE) {
      const namespaceIds = await this.namespacesService.listNamespaceIds(
        offset,
        NAMESPACE_BATCH_SIZE,
      );
      counts.namespaces += namespaceIds.length;
      for (const namespaceId of namespaceIds) {
        const userIds =
          await this.namespacesService.getMemberUserIds(namespaceId);
        for (const userId of userIds) {
          counts.members++;
          try {
            const generated = await this.regenerateQuestions(
              namespaceId,
              userId,
            );
            if (generated) {
              counts.generated++;
            }
          } catch (err) {
            counts.failed++;
            this.logger.error(
              `Failed to process recommended questions for ${namespaceId}:${userId}`,
              err instanceof Error ? err.stack : String(err),
            );
          }
        }
      }
      if (namespaceIds.length < NAMESPACE_BATCH_SIZE) {
        break;
      }
    }

    const span = trace.getActiveSpan();
    span?.setAttribute('scan.namespaces', counts.namespaces);
    span?.setAttribute('scan.members', counts.members);
    span?.setAttribute('scan.generated', counts.generated);
    span?.setAttribute('scan.failed', counts.failed);
    this.logger.log(`Recommended questions scan: ${JSON.stringify(counts)}`);
  }

  async regenerateQuestions(
    namespaceId: string,
    userId: string,
  ): Promise<boolean> {
    const now = new Date();

    const record = await this.acquireRecord(namespaceId, userId, now);
    if (!record) {
      return false;
    }

    const lastUpdated = await this.getLastUpdatedAt(namespaceId, userId);
    if (!lastUpdated) {
      return false;
    }
    if (record.generatedAt && record.generatedAt > lastUpdated) {
      return false;
    }

    const res = await this.recommendedQuestionsService.generateQuestions(
      namespaceId,
      userId,
    );
    await this.recommendedQuestionsRepository.manager.transaction(
      async (manager) => {
        await manager.getRepository(RecommendedQuestionItem).delete({
          recommendedQuestionId: record.id,
        });
        if (res.questions.length > 0) {
          await manager.getRepository(RecommendedQuestionItem).insert(
            res.questions.map((q) => ({
              recommendedQuestionId: record.id,
              question: q.question,
              meta: {
                intent: q.intent,
                reason: q.reason,
                resourceIds: q.resourceIds ?? [],
                tagIds: q.tagIds ?? [],
                conversationIds: q.conversationIds ?? [],
              },
            })),
          );
        }
        await manager
          .getRepository(RecommendedQuestion)
          .update({ id: record.id }, { generatedAt: now });
      },
    );
    return true;
  }

  private async acquireRecord(
    namespaceId: string,
    userId: string,
    now: Date,
  ): Promise<RecommendedQuestion | null> {
    const record = await this.recommendedQuestionsRepository.findOne({
      where: { namespaceId, userId },
    });

    if (!record) {
      try {
        await this.recommendedQuestionsRepository.insert({
          namespaceId,
          userId,
          scannedAt: now,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return null;
        }
        throw err;
      }
      return await this.recommendedQuestionsRepository.findOneOrFail({
        where: { namespaceId, userId },
      });
    }

    if (now.getTime() - record.scannedAt.getTime() < SCAN_FRESHNESS_MS) {
      return null;
    }
    const result = await this.recommendedQuestionsRepository.update(
      { namespaceId, userId, scannedAt: record.scannedAt },
      { scannedAt: now },
    );
    if (result.affected !== 1) {
      return null;
    }
    record.scannedAt = now;
    return record;
  }

  private async getLastUpdatedAt(
    namespaceId: string,
    userId: string,
  ): Promise<Date | undefined> {
    const [resourceLast, recentTags, recentConversations] = await Promise.all([
      this.namespaceResourcesService.getLastUpdatedAt(namespaceId),
      this.tagService.getRecentTags(namespaceId, 1),
      this.conversationsService.findAll(namespaceId, userId, { limit: 1 }),
    ]);
    return maxDate(
      resourceLast,
      recentTags[0]?.updatedAt,
      recentConversations[0]?.updatedAt,
    );
  }
}
