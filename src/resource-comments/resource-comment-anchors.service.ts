import { createHash } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { EntityManager } from 'typeorm';

import { ResourceCommentAnchorRequestDto } from './dto/resource-comment-request.dto';
import {
  ResourceCommentAnchorStatus,
  ResourceCommentThread,
} from './entities/resource-comment-thread.entity';

@Injectable()
export class ResourceCommentAnchorsService {
  constructor(private readonly i18n: I18nService) {}
  // Generates the stable SHA-256 hash used to version Markdown content.
  contentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  // Locks a resource row and rejects requests based on stale document content.
  async lockAndAssertContentHash(
    manager: EntityManager,
    namespaceId: string,
    resourceId: string,
    expectedContentHash: string,
  ): Promise<void> {
    const resource = await this.lockResource(manager, namespaceId, resourceId);
    this.assertContentHash(resource.content, expectedContentHash);
  }

  // Updates active anchors and marks explicitly reported threads as orphaned.
  async syncAnchors(
    manager: EntityManager,
    namespaceId: string,
    resourceId: string,
    content: string,
    anchors: ResourceCommentAnchorRequestDto[],
    orphanedThreadIds: string[],
  ): Promise<void> {
    const repository = manager.getRepository(ResourceCommentThread);
    const threads = await repository.find({
      where: { namespaceId, resourceId },
    });
    const threadsById = new Map(threads.map((thread) => [thread.id, thread]));
    const submittedIds = new Set<string>();
    const orphanedIds = new Set(orphanedThreadIds);
    const contentHash = this.contentHash(content);

    if (orphanedIds.size !== orphanedThreadIds.length) {
      throw this.invalidAnchorException();
    }

    for (const anchor of anchors) {
      this.assertValidRange(anchor.from, anchor.to);
      const thread = threadsById.get(anchor.threadId);
      if (!thread || submittedIds.has(thread.id)) {
        throw this.invalidAnchorException();
      }
      if (orphanedIds.has(thread.id)) {
        throw this.invalidAnchorException();
      }
      submittedIds.add(thread.id);
      thread.anchorFrom = anchor.from;
      thread.anchorTo = anchor.to;
      thread.quotedText = anchor.quotedText;
      thread.anchorPrefix = anchor.prefix ?? '';
      thread.anchorSuffix = anchor.suffix ?? '';
      thread.contentHash = contentHash;
      thread.anchorStatus = ResourceCommentAnchorStatus.ACTIVE;
    }

    for (const threadId of orphanedIds) {
      const thread = threadsById.get(threadId);
      if (!thread) {
        throw this.invalidAnchorException();
      }
      thread.anchorStatus = ResourceCommentAnchorStatus.ORPHANED;
    }
    const changedThreads = threads.filter(
      (thread) => submittedIds.has(thread.id) || orphanedIds.has(thread.id),
    );
    if (changedThreads.length > 0) {
      await repository.save(changedThreads);
    }
  }

  async orphanAnchors(
    manager: EntityManager,
    namespaceId: string,
    resourceId: string,
  ): Promise<void> {
    await manager.getRepository(ResourceCommentThread).update(
      {
        namespaceId,
        resourceId,
        anchorStatus: ResourceCommentAnchorStatus.ACTIVE,
      },
      { anchorStatus: ResourceCommentAnchorStatus.ORPHANED },
    );
  }

  // Finds and pessimistically locks a resource for a serialized write.
  async lockResource(
    manager: EntityManager,
    namespaceId: string,
    resourceId: string,
  ): Promise<Resource> {
    const resource = await manager.getRepository(Resource).findOne({
      where: { id: resourceId, namespaceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!resource) {
      throw new AppException(
        this.i18n.t('resource.errors.resourceNotFound'),
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return resource;
  }

  // Rejects a request when its expected hash differs from current content.
  assertContentHash(content: string, expectedHash: string): void {
    if (this.contentHash(content) !== expectedHash) {
      throw new AppException(
        this.i18n.t('resourceComment.errors.contentConflict'),
        'RESOURCE_CONTENT_CONFLICT',
        HttpStatus.CONFLICT,
      );
    }
  }

  // Ensures an anchor starts before it ends.
  assertValidRange(from: number, to: number): void {
    if (from >= to) {
      throw this.invalidAnchorException();
    }
  }

  // Builds the standard invalid-anchor API exception.
  private invalidAnchorException(): AppException {
    return new AppException(
      this.i18n.t('resourceComment.errors.invalidAnchor'),
      'INVALID_COMMENT_ANCHOR',
      HttpStatus.BAD_REQUEST,
    );
  }
}
