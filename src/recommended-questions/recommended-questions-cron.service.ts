import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { trace } from '@opentelemetry/api';
import { Span } from 'nestjs-otel';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { RecommendedQuestions } from 'omniboxd/recommended-questions/entities/recommended-questions.entity';
import { RecommendedQuestionsService } from 'omniboxd/recommended-questions/recommended-questions.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { IsNull, QueryFailedError, Repository } from 'typeorm';

// Slightly below the cron interval so a pair scanned seconds after a tick
// is not skipped at the next tick (which would double the effective cadence).
const SCAN_FRESHNESS_MS = 9 * 60 * 1000;
const NAMESPACE_BATCH_SIZE = 100;

export type ScanAction = 'skip' | 'generate' | 'touch';

export function computeAction(
  row: RecommendedQuestions | undefined,
  lastModified: Date | undefined,
  now: Date,
): ScanAction {
  if (
    row?.scannedAt &&
    now.getTime() - row.scannedAt.getTime() < SCAN_FRESHNESS_MS
  ) {
    return 'skip';
  }
  if (!row?.generatedAt) {
    return 'generate';
  }
  if (lastModified && lastModified > row.generatedAt) {
    return 'generate';
  }
  return 'touch';
}

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
    @InjectRepository(RecommendedQuestions)
    private readonly recommendedQuestionsRepository: Repository<RecommendedQuestions>,
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
      skipped: 0,
      generated: 0,
      touched: 0,
      failed: 0,
    };
    for (let offset = 0; ; offset += NAMESPACE_BATCH_SIZE) {
      const namespaceIds = await this.namespacesService.listNamespaceIds(
        offset,
        NAMESPACE_BATCH_SIZE,
      );
      if (namespaceIds.length === 0) {
        break;
      }
      counts.namespaces += namespaceIds.length;
      for (const namespaceId of namespaceIds) {
        const userIds =
          await this.namespacesService.getMemberUserIds(namespaceId);
        for (const userId of userIds) {
          counts.members++;
          try {
            const action = await this.checkRecommendQuestions(
              namespaceId,
              userId,
            );
            if (action === 'skip') {
              counts.skipped++;
            } else if (action === 'generate') {
              counts.generated++;
            } else {
              counts.touched++;
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
    span?.setAttribute('scan.skipped', counts.skipped);
    span?.setAttribute('scan.generated', counts.generated);
    span?.setAttribute('scan.touched', counts.touched);
    span?.setAttribute('scan.failed', counts.failed);
    this.logger.log(`Recommended questions scan: ${JSON.stringify(counts)}`);
  }

  async checkRecommendQuestions(
    namespaceId: string,
    userId: string,
  ): Promise<ScanAction> {
    const now = new Date();
    const row =
      (await this.recommendedQuestionsRepository.findOne({
        where: { namespaceId, userId },
      })) ?? undefined;
    // Fresh rows are the common case; return before the activity lookups.
    if (
      row?.scannedAt &&
      now.getTime() - row.scannedAt.getTime() < SCAN_FRESHNESS_MS
    ) {
      return 'skip';
    }
    const lastModified = await this.getLastModifiedAt(namespaceId, userId);
    const action = computeAction(row, lastModified, now);
    if (action === 'skip') {
      return 'skip';
    }
    // Insert-on-conflict-skip plus a compare-and-swap on scanned_at claim the
    // pair, so concurrent instances never process it twice. If generation
    // fails after the claim, the pair is simply rescanned once scanned_at
    // ages out.
    if (!row && !(await this.insertEmptyRow(namespaceId, userId))) {
      return 'skip';
    }
    if (
      !(await this.claimScan(namespaceId, userId, row?.scannedAt ?? null, now))
    ) {
      return 'skip';
    }
    if (action === 'generate') {
      const res =
        await this.recommendedQuestionsService.getRecommendedQuestions(
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
    }
    // For 'touch', the claim already updated scanned_at; nothing else to do.
    return action;
  }

  private async getLastModifiedAt(
    namespaceId: string,
    userId: string,
  ): Promise<Date | undefined> {
    const [resourceLast, recentTags, recentConversations] = await Promise.all([
      this.namespaceResourcesService.getLastUpdatedAt(namespaceId),
      this.tagService.getRecentTags(namespaceId, 1),
      this.conversationsService.getRecentConversations(namespaceId, userId, 1),
    ]);
    return maxDate(
      resourceLast,
      recentTags[0]?.updatedAt,
      recentConversations[0]?.updatedAt,
    );
  }

  private async insertEmptyRow(
    namespaceId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      await this.recommendedQuestionsRepository.insert({
        namespaceId,
        userId,
      });
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) {
        return false;
      }
      throw err;
    }
  }

  private async claimScan(
    namespaceId: string,
    userId: string,
    previousScannedAt: Date | null,
    now: Date,
  ): Promise<boolean> {
    const result = await this.recommendedQuestionsRepository.update(
      {
        namespaceId,
        userId,
        scannedAt: previousScannedAt ?? IsNull(),
      },
      { scannedAt: now },
    );
    return (result.affected ?? 0) > 0;
  }
}
