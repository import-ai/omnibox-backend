import { createHash } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { DataSource, EntityManager, Repository } from 'typeorm';

import {
  CreateResourceCommentRequestDto,
  CreateResourceCommentThreadRequestDto,
  ListResourceCommentThreadsRequestDto,
  ResourceCommentAnchorRequestDto,
  UpdateResourceCommentRequestDto,
  UpdateResourceCommentThreadRequestDto,
} from './dto/resource-comment-request.dto';
import {
  CreateResourceCommentThreadResponseDto,
  ListResourceCommentThreadsResponseDto,
  ResourceCommentThreadResponseDto,
} from './dto/resource-comment-response.dto';
import { ResourceComment } from './entities/resource-comment.entity';
import {
  ResourceCommentAnchorStatus,
  ResourceCommentThread,
} from './entities/resource-comment-thread.entity';

@Injectable()
export class ResourceCommentsService {
  // Injects repositories and shared services used by comment operations.
  constructor(
    @InjectRepository(ResourceCommentThread)
    private readonly threadRepository: Repository<ResourceCommentThread>,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService,
  ) {}

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
      if (orphanedIds.has(thread.id)) throw this.invalidAnchorException();
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
      if (!thread) throw this.invalidAnchorException();
      thread.anchorStatus = ResourceCommentAnchorStatus.ORPHANED;
    }
    const activeThreads = threads
      .filter((thread) => submittedIds.has(thread.id))
      .sort((left, right) => left.anchorFrom - right.anchorFrom);
    for (let index = 1; index < activeThreads.length; index++) {
      if (activeThreads[index].anchorFrom < activeThreads[index - 1].anchorTo) {
        throw this.anchorOverlapException();
      }
    }
    const changedThreads = threads.filter(
      (thread) => submittedIds.has(thread.id) || orphanedIds.has(thread.id),
    );
    if (changedThreads.length > 0) await repository.save(changedThreads);
  }

  // Loads the content hash and complete comment state for a resource response.
  async getResourceCommentData(
    namespaceId: string,
    resourceId: string,
    content: string,
  ): Promise<{
    content_hash: string;
    comment_threads: ResourceCommentThreadResponseDto[];
  }> {
    const threads = await this.threadRepository
      .createQueryBuilder('thread')
      .leftJoinAndSelect('thread.creator', 'creator')
      .leftJoinAndSelect('thread.comments', 'comment')
      .leftJoinAndSelect('comment.author', 'author')
      .where('thread.namespace_id = :namespaceId', { namespaceId })
      .andWhere('thread.resource_id = :resourceId', { resourceId })
      .orderBy('thread.created_at', 'ASC')
      .addOrderBy('comment.created_at', 'ASC')
      .getMany();

    return {
      content_hash: this.contentHash(content),
      comment_threads: threads.map((thread) =>
        ResourceCommentThreadResponseDto.fromEntity(thread),
      ),
    };
  }

  // Returns permission-checked comment threads with filtering and pagination.
  async listThreads(
    namespaceId: string,
    resourceId: string,
    userId: string,
    query: ListResourceCommentThreadsRequestDto,
  ): Promise<ListResourceCommentThreadsResponseDto> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );

    const builder = this.threadRepository
      .createQueryBuilder('thread')
      .leftJoinAndSelect('thread.creator', 'creator')
      .leftJoinAndSelect('thread.comments', 'comment')
      .leftJoinAndSelect('comment.author', 'author')
      .where('thread.namespace_id = :namespaceId', { namespaceId })
      .andWhere('thread.resource_id = :resourceId', { resourceId });
    if (query.resolved !== undefined) {
      builder.andWhere(
        query.resolved === 'true'
          ? 'thread.resolved_at IS NOT NULL'
          : 'thread.resolved_at IS NULL',
      );
    }
    const [threads, total] = await builder
      .orderBy('thread.createdAt', 'DESC')
      .addOrderBy('comment.createdAt', 'ASC')
      .skip(query.offlet)
      .take(query.limits)
      .getManyAndCount();

    return {
      items: threads.map((thread) =>
        ResourceCommentThreadResponseDto.fromEntity(thread),
      ),
      total,
      offlet: query.offlet,
      limits: query.limits,
      has_more: query.offlet + threads.length < total,
    };
  }

  // Creates an anchored thread or appends to an existing exact-match thread.
  async createThread(
    namespaceId: string,
    resourceId: string,
    userId: string,
    dto: CreateResourceCommentThreadRequestDto,
  ): Promise<CreateResourceCommentThreadResponseDto> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_COMMENT,
    );
    this.assertValidRange(dto.anchorFrom, dto.anchorTo);

    return await this.dataSource.transaction(async (manager) => {
      const resource = await this.lockResource(
        manager,
        namespaceId,
        resourceId,
      );
      this.assertContentHash(resource.content, dto.expectedContentHash);

      const existing = await manager
        .getRepository(ResourceCommentThread)
        .createQueryBuilder('thread')
        .where('thread.namespace_id = :namespaceId', { namespaceId })
        .andWhere('thread.resource_id = :resourceId', { resourceId })
        .andWhere('thread.content_hash = :contentHash', {
          contentHash: dto.expectedContentHash,
        })
        .andWhere('thread.resolved_at IS NULL')
        .andWhere('thread.deleted_at IS NULL')
        .andWhere('thread.anchor_from < :anchorTo', {
          anchorTo: dto.anchorTo,
        })
        .andWhere('thread.anchor_to > :anchorFrom', {
          anchorFrom: dto.anchorFrom,
        })
        .getOne();

      if (existing) {
        if (
          existing.anchorFrom !== dto.anchorFrom ||
          existing.anchorTo !== dto.anchorTo ||
          existing.quotedText !== dto.quotedText
        ) {
          throw this.anchorOverlapException();
        }
        await this.saveComment(manager, existing.id, userId, dto.content);
        return {
          thread: await this.getThreadResponse(manager, existing.id),
          thread_created: false,
          comment_created: true,
        };
      }

      const thread = manager.getRepository(ResourceCommentThread).create({
        namespaceId,
        resourceId,
        creatorId: userId,
        quotedText: dto.quotedText,
        anchorFrom: dto.anchorFrom,
        anchorTo: dto.anchorTo,
        anchorPrefix: dto.anchorPrefix ?? '',
        anchorSuffix: dto.anchorSuffix ?? '',
        contentHash: dto.expectedContentHash,
        anchorStatus: ResourceCommentAnchorStatus.ACTIVE,
        resolvedAt: null,
        resolvedById: null,
      });
      const savedThread = await manager.save(thread);
      await this.saveComment(manager, savedThread.id, userId, dto.content);

      return {
        thread: await this.getThreadResponse(manager, savedThread.id),
        thread_created: true,
        comment_created: true,
      };
    });
  }

  // Adds a reply to an existing comment thread.
  async createComment(
    namespaceId: string,
    resourceId: string,
    threadId: string,
    userId: string,
    dto: CreateResourceCommentRequestDto,
  ): Promise<ResourceCommentThreadResponseDto> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_COMMENT,
    );
    return await this.dataSource.transaction(async (manager) => {
      await this.getThreadOrFail(
        namespaceId,
        resourceId,
        threadId,
        manager,
        true,
      );
      await this.saveComment(manager, threadId, userId, dto.content);
      return await this.getThreadResponse(manager, threadId);
    });
  }

  // Resolves or reopens a thread after validating moderation permissions.
  async updateThread(
    namespaceId: string,
    resourceId: string,
    threadId: string,
    userId: string,
    dto: UpdateResourceCommentThreadRequestDto,
  ): Promise<ResourceCommentThreadResponseDto> {
    return await this.dataSource.transaction(async (manager) => {
      await this.lockResource(manager, namespaceId, resourceId);
      const thread = await this.getThreadOrFail(
        namespaceId,
        resourceId,
        threadId,
        manager,
        true,
      );
      await this.assertCanModerate(thread, userId);

      if (!dto.resolved) {
        const overlap = await manager
          .getRepository(ResourceCommentThread)
          .createQueryBuilder('candidate')
          .where('candidate.namespace_id = :namespaceId', { namespaceId })
          .andWhere('candidate.resource_id = :resourceId', { resourceId })
          .andWhere('candidate.id != :threadId', { threadId })
          .andWhere('candidate.content_hash = :contentHash', {
            contentHash: thread.contentHash,
          })
          .andWhere('candidate.resolved_at IS NULL')
          .andWhere('candidate.deleted_at IS NULL')
          .andWhere('candidate.anchor_from < :anchorTo', {
            anchorTo: thread.anchorTo,
          })
          .andWhere('candidate.anchor_to > :anchorFrom', {
            anchorFrom: thread.anchorFrom,
          })
          .getOne();
        if (overlap) throw this.anchorOverlapException();
      }

      thread.resolvedAt = dto.resolved ? new Date() : null;
      thread.resolvedById = dto.resolved ? userId : null;
      await manager.save(thread);
      return await this.getThreadResponse(manager, threadId);
    });
  }

  // Edits a comment when the requester is its author or a resource editor.
  async updateComment(
    namespaceId: string,
    resourceId: string,
    threadId: string,
    commentId: string,
    userId: string,
    dto: UpdateResourceCommentRequestDto,
  ): Promise<ResourceCommentThreadResponseDto> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_COMMENT,
    );
    return await this.dataSource.transaction(async (manager) => {
      await this.getThreadOrFail(
        namespaceId,
        resourceId,
        threadId,
        manager,
        true,
      );
      const comment = await manager.getRepository(ResourceComment).findOne({
        where: { id: commentId, threadId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!comment) throw this.commentNotFoundException();
      await this.assertCanEditComment(namespaceId, resourceId, comment, userId);

      comment.content = dto.content;
      await manager.save(comment);
      return await this.getThreadResponse(manager, threadId);
    });
  }

  // Soft-deletes a thread and all comments contained in it.
  async deleteThread(
    namespaceId: string,
    resourceId: string,
    threadId: string,
    userId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockResource(manager, namespaceId, resourceId);
      const thread = await this.getThreadOrFail(
        namespaceId,
        resourceId,
        threadId,
        manager,
        true,
      );
      await this.assertCanModerate(thread, userId);
      await manager.softDelete(ResourceComment, { threadId });
      await manager.softDelete(ResourceCommentThread, { id: threadId });
    });
  }

  // Soft-deletes one comment and removes the thread when no comments remain.
  async deleteComment(
    namespaceId: string,
    resourceId: string,
    threadId: string,
    commentId: string,
    userId: string,
  ): Promise<ResourceCommentThreadResponseDto | null> {
    return await this.dataSource.transaction(async (manager) => {
      const thread = await this.getThreadOrFail(
        namespaceId,
        resourceId,
        threadId,
        manager,
        true,
      );
      const comment = await manager.getRepository(ResourceComment).findOne({
        where: { id: commentId, threadId },
      });
      if (!comment) throw this.commentNotFoundException();

      await this.assertCanEditComment(namespaceId, resourceId, comment, userId);

      await manager.softDelete(ResourceComment, { id: commentId, threadId });
      const remaining = await manager.getRepository(ResourceComment).count({
        where: { threadId },
      });
      if (remaining === 0) {
        await manager.softDelete(ResourceCommentThread, { id: thread.id });
        return null;
      }
      return await this.getThreadResponse(manager, threadId);
    });
  }

  // Persists a new comment inside the current transaction.
  private async saveComment(
    manager: EntityManager,
    threadId: string,
    authorId: string,
    content: string,
  ): Promise<void> {
    await manager.save(
      manager.getRepository(ResourceComment).create({
        threadId,
        authorId,
        content,
      }),
    );
  }

  // Finds a thread in the requested resource and optionally locks its row.
  private async getThreadOrFail(
    namespaceId: string,
    resourceId: string,
    threadId: string,
    manager: EntityManager = this.dataSource.manager,
    lock: boolean = false,
  ): Promise<ResourceCommentThread> {
    const thread = await manager.getRepository(ResourceCommentThread).findOne({
      where: { id: threadId, namespaceId, resourceId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!thread) throw this.threadNotFoundException();
    return thread;
  }

  // Reloads a thread with its creator, comments, and comment authors.
  private async getThreadResponse(
    manager: EntityManager,
    threadId: string,
  ): Promise<ResourceCommentThreadResponseDto> {
    const thread = await manager
      .getRepository(ResourceCommentThread)
      .createQueryBuilder('thread')
      .leftJoinAndSelect('thread.creator', 'creator')
      .leftJoinAndSelect('thread.comments', 'comment')
      .leftJoinAndSelect('comment.author', 'author')
      .where('thread.id = :threadId', { threadId })
      .orderBy('comment.created_at', 'ASC')
      .getOne();
    if (!thread) throw this.threadNotFoundException();
    return ResourceCommentThreadResponseDto.fromEntity(thread);
  }

  // Finds and pessimistically locks a resource for a serialized write.
  private async lockResource(
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

  // Allows thread moderation by the creator or a resource editor.
  private async assertCanModerate(
    thread: ResourceCommentThread,
    userId: string,
  ): Promise<void> {
    if (thread.creatorId === userId) return;
    const canEdit = await this.permissionsService.userHasPermission(
      thread.namespaceId,
      thread.resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!canEdit) throw this.notAuthorizedException();
  }

  // Allows comment mutation by the author or a resource editor.
  private async assertCanEditComment(
    namespaceId: string,
    resourceId: string,
    comment: ResourceComment,
    userId: string,
  ): Promise<void> {
    if (comment.authorId === userId) return;
    const canEdit = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!canEdit) throw this.notAuthorizedException();
  }

  // Rejects a request when its expected hash differs from current content.
  private assertContentHash(content: string, expectedHash: string): void {
    if (this.contentHash(content) !== expectedHash) {
      throw new AppException(
        this.i18n.t('resourceComment.errors.contentConflict'),
        'RESOURCE_CONTENT_CONFLICT',
        HttpStatus.CONFLICT,
      );
    }
  }

  // Ensures an anchor starts before it ends.
  private assertValidRange(from: number, to: number): void {
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

  // Builds the conflict raised for overlapping active anchors.
  private anchorOverlapException(): AppException {
    return new AppException(
      this.i18n.t('resourceComment.errors.anchorOverlap'),
      'COMMENT_ANCHOR_OVERLAP',
      HttpStatus.CONFLICT,
    );
  }

  // Builds the standard thread-not-found API exception.
  private threadNotFoundException(): AppException {
    return new AppException(
      this.i18n.t('resourceComment.errors.threadNotFound'),
      'COMMENT_THREAD_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  }

  // Builds the standard comment-not-found API exception.
  private commentNotFoundException(): AppException {
    return new AppException(
      this.i18n.t('resourceComment.errors.commentNotFound'),
      'COMMENT_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  }

  // Builds the standard authorization failure API exception.
  private notAuthorizedException(): AppException {
    return new AppException(
      this.i18n.t('auth.errors.notAuthorized'),
      'NOT_AUTHORIZED',
      HttpStatus.FORBIDDEN,
    );
  }
}
