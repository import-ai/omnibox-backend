import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { S3Service } from 'omniboxd/s3/s3.service';
import {
  StorageType,
  StorageUsage,
} from 'omniboxd/storage-usages/entities/storage-usage.entity';
import { StorageUsagesService } from 'omniboxd/storage-usages/storage-usages.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { COMMENT_ATTACHMENT_TTL_MS } from './comment-image';
import { ResourceCommentAttachment } from './entities/resource-comment-attachment.entity';

@Injectable()
export class CommentAttachmentCleanupService {
  private readonly logger = new Logger(CommentAttachmentCleanupService.name);

  constructor(
    @InjectRepository(ResourceCommentAttachment)
    private readonly repository: Repository<ResourceCommentAttachment>,
    private readonly s3Service: S3Service,
    private readonly storageUsagesService: StorageUsagesService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { waitForCompletion: true })
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - COMMENT_ATTACHMENT_TTL_MS);
    const candidates = await this.eligible(this.repository, cutoff)
      .select(['attachment.id'])
      .orderBy('attachment.updated_at', 'ASC')
      .take(100)
      .getMany();

    for (const candidate of candidates) {
      try {
        await transaction(this.repository.manager, async (tx) => {
          const repository = tx.entityManager.getRepository(
            ResourceCommentAttachment,
          );
          // Binding uses the same row lock. Recheck eligibility after obtaining it.
          const locked = await repository.findOne({
            where: { id: candidate.id },
            withDeleted: true,
            lock: { mode: 'pessimistic_write' },
          });
          if (!locked) {
            return;
          }
          const attachment = await this.eligible(repository, cutoff)
            .andWhere('attachment.id = :id', { id: candidate.id })
            .getOne();
          if (!attachment) {
            return;
          }
          await this.s3Service.deleteObject(attachment.objectKey);
          if (attachment.storageUserId) {
            await tx.entityManager.query(
              'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
              [
                `comment-storage:${attachment.namespaceId}:${attachment.storageUserId}`,
              ],
            );
            const usage = await tx.entityManager
              .getRepository(StorageUsage)
              .findOneBy({
                namespaceId: attachment.namespaceId,
                userId: attachment.storageUserId,
                storageType: StorageType.ATTACHMENT,
              });
            if (usage) {
              await this.storageUsagesService.updateStorageUsage(
                attachment.namespaceId,
                attachment.storageUserId,
                StorageType.ATTACHMENT,
                -attachment.size,
                tx,
              );
            }
          }
          await repository.delete(attachment.id);
        });
      } catch (error) {
        this.logger.error(
          `Comment attachment cleanup failed: ${candidate.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private eligible(
    repository: Repository<ResourceCommentAttachment>,
    cutoff: Date,
  ): SelectQueryBuilder<ResourceCommentAttachment> {
    return repository
      .createQueryBuilder('attachment')
      .withDeleted()
      .where(
        `(
      attachment.deleted_at IS NOT NULL
      OR (attachment.comment_id IS NULL AND attachment.updated_at <= :cutoff)
      OR NOT EXISTS (
        SELECT 1 FROM resources r WHERE r.id = attachment.resource_id
          AND r.namespace_id = attachment.namespace_id AND r.permanent_deleted_at IS NULL
      )
      OR EXISTS (
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_id, permanent_deleted_at FROM resources WHERE id = attachment.resource_id
          UNION
          SELECT r.id, r.parent_id, r.permanent_deleted_at FROM resources r
          JOIN ancestors a ON r.id = a.parent_id
        ) SELECT 1 FROM ancestors WHERE permanent_deleted_at IS NOT NULL
      )
      OR (attachment.comment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM resource_comments c
        JOIN resource_comment_threads t ON t.id = c.thread_id
        WHERE c.id = attachment.comment_id AND c.deleted_at IS NULL AND t.deleted_at IS NULL
      ))
    )`,
        { cutoff },
      );
  }
}
