import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { trace } from '@opentelemetry/api';
import { Span } from 'nestjs-otel';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { RecommendedQuestion } from 'omniboxd/recommended-questions/entities/recommended-question.entity';
import { RecommendedQuestionsService } from 'omniboxd/recommended-questions/recommended-questions.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { QueryFailedError, Repository } from 'typeorm';

// Slightly below the cron interval so a pair scanned seconds after a tick
// is not skipped at the next tick (which would double the effective cadence).
const SCAN_FRESHNESS_MS = 9 * 60 * 1000;
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

  @Cron(CronExpression.EVERY_10_MINUTES, { waitForCompletion: true })
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
            const generated = await this.checkRecommendQuestions(
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

  async checkRecommendQuestions(
    namespaceId: string,
    userId: string,
  ): Promise<boolean> {
    const now = new Date();
    if (!(await this.shouldGenerate(namespaceId, userId, now))) {
      return false;
    }
    const res = await this.recommendedQuestionsService.getRecommendedQuestions(
      namespaceId,
      userId,
    );
    await this.recommendedQuestionsRepository.update(
      { namespaceId, userId },
      {
        questions: res.questions.map((q) => ({
          question: q.question,
          intent: q.intent,
          reason: q.reason,
        })),
        generatedAt: now,
      },
    );
    return true;
  }

  private async findOrInsert(
    namespaceId: string,
    userId: string,
    now: Date,
  ): Promise<RecommendedQuestion> {
    const record = await this.recommendedQuestionsRepository.findOne({
      where: { namespaceId, userId },
    });
    if (record) {
      return record;
    }
    try {
      await this.recommendedQuestionsRepository.insert({
        namespaceId,
        userId,
        scannedAt: now,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) {
        throw err;
      }
    }
    return await this.recommendedQuestionsRepository.findOneOrFail({
      where: { namespaceId, userId },
    });
  }

  // Inserting the row on conflict-skip and compare-and-swapping scanned_at
  // claim the pair, so concurrent instances never process it twice. If
  // generation fails after the claim, the pair is simply rescanned once
  // scanned_at ages out.
  private async shouldGenerate(
    namespaceId: string,
    userId: string,
    now: Date,
  ): Promise<boolean> {
    const record = await this.findOrInsert(namespaceId, userId, now);

    if (now.getTime() - record.scannedAt.getTime() < SCAN_FRESHNESS_MS) {
      return false;
    }

    const result = await this.recommendedQuestionsRepository.update(
      { namespaceId, userId, scannedAt: record.scannedAt },
      { scannedAt: now },
    );
    if (result.affected !== 1) {
      return false;
    }

    const lastUpdated = await this.getLastUpdatedAt(namespaceId, userId);
    if (!lastUpdated) {
      return false;
    }

    return !record.generatedAt || record.generatedAt <= lastUpdated;
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
