import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { DataSource, EntityManager } from 'typeorm';

import {
  CreateResourceCommentRequestDto,
  CreateResourceCommentThreadRequestDto,
  UpdateResourceCommentRequestDto,
  UpdateResourceCommentThreadRequestDto,
} from './dto/resource-comment-request.dto';
import {
  CreateResourceCommentThreadResponseDto,
  ResourceCommentThreadResponseDto,
} from './dto/resource-comment-response.dto';
import { ResourceComment } from './entities/resource-comment.entity';
import { ResourceCommentAttachment } from './entities/resource-comment-attachment.entity';
import {
  ResourceCommentAnchorStatus,
  ResourceCommentThread,
} from './entities/resource-comment-thread.entity';
import { ResourceCommentAnchorsService } from './resource-comment-anchors.service';
import { ResourceCommentAttachmentsService } from './resource-comment-attachments.service';
import { ResourceCommentQueriesService } from './resource-comment-queries.service';

@Injectable()
export class ResourceCommentsService {
  // Injects repositories and shared services used by comment operations.
  constructor(
    private readonly queriesService: ResourceCommentQueriesService,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly attachmentsService: ResourceCommentAttachmentsService,
    private readonly i18n: I18nService,
    private readonly anchorsService: ResourceCommentAnchorsService,
  ) {}

  // Creates an anchored thread. Exact-match anchors are allowed to form separate threads.
  async createThread(
    namespaceId: string,
    resourceId: string,
    userId: string,
    dto: CreateResourceCommentThreadRequestDto,
    enforcePermission = true,
  ): Promise<CreateResourceCommentThreadResponseDto> {
    if (enforcePermission) {
      await this.permissionsService.userHasPermissionOrFail(
        namespaceId,
        resourceId,
        userId,
        ResourcePermission.CAN_COMMENT,
      );
    }
    this.anchorsService.assertValidRange(dto.anchorFrom, dto.anchorTo);

    return await this.dataSource.transaction(async (manager) => {
      const resource = await this.anchorsService.lockResource(
        manager,
        namespaceId,
        resourceId,
      );
      this.anchorsService.assertContentHash(
        resource.content,
        dto.expectedContentHash,
      );

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
      await this.saveComment(
        manager,
        namespaceId,
        resourceId,
        savedThread.id,
        userId,
        dto.content,
        dto.attachmentIds,
      );

      return {
        thread: await this.queriesService.getThreadResponse(
          manager,
          savedThread.id,
        ),
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
    enforcePermission = true,
  ): Promise<ResourceCommentThreadResponseDto> {
    if (enforcePermission) {
      await this.permissionsService.userHasPermissionOrFail(
        namespaceId,
        resourceId,
        userId,
        ResourcePermission.CAN_COMMENT,
      );
    }
    return await this.dataSource.transaction(async (manager) => {
      await this.getThreadOrFail(
        namespaceId,
        resourceId,
        threadId,
        manager,
        true,
      );
      await this.saveComment(
        manager,
        namespaceId,
        resourceId,
        threadId,
        userId,
        dto.content,
        dto.attachmentIds,
      );
      return await this.queriesService.getThreadResponse(manager, threadId);
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
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_COMMENT,
    );
    return await this.dataSource.transaction(async (manager) => {
      await this.anchorsService.lockResource(manager, namespaceId, resourceId);
      const thread = await this.getThreadOrFail(
        namespaceId,
        resourceId,
        threadId,
        manager,
        true,
      );
      await this.assertCanModerate(thread, userId);

      thread.resolvedAt = dto.resolved ? new Date() : null;
      thread.resolvedById = dto.resolved ? userId : null;
      await manager.save(thread);
      return await this.queriesService.getThreadResponse(manager, threadId);
    });
  }

  // Edits a comment only when the requester is its author.
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
      if (!comment) {
        throw this.commentNotFoundException();
      }
      if (comment.authorId !== userId) {
        throw this.notAuthorizedException();
      }

      const trimmedContent =
        dto.content === undefined ? comment.content : dto.content.trim();
      const currentAttachments = await manager
        .getRepository(ResourceCommentAttachment)
        .find({
          where: { commentId: comment.id },
        });
      const uniqueAttachmentIds =
        dto.attachmentIds === undefined
          ? currentAttachments.map((attachment) => attachment.id)
          : [...new Set(dto.attachmentIds)];
      if (!trimmedContent && uniqueAttachmentIds.length === 0) {
        throw new AppException(
          this.i18n.t('resourceComment.errors.emptyComment'),
          'EMPTY_COMMENT',
          HttpStatus.BAD_REQUEST,
        );
      }

      comment.content = trimmedContent;
      await manager.save(comment);
      await this.attachmentsService.replaceAttachments(
        manager,
        namespaceId,
        resourceId,
        userId,
        comment.id,
        currentAttachments,
        uniqueAttachmentIds,
      );
      return await this.queriesService.getThreadResponse(manager, threadId);
    });
  }

  // Soft-deletes a thread and all comments contained in it.
  async deleteThread(
    namespaceId: string,
    resourceId: string,
    threadId: string,
    userId: string,
  ): Promise<void> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_COMMENT,
    );
    await this.dataSource.transaction(async (manager) => {
      await this.anchorsService.lockResource(manager, namespaceId, resourceId);
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
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_COMMENT,
    );
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
      if (!comment) {
        throw this.commentNotFoundException();
      }

      await this.assertCanDeleteComment(
        namespaceId,
        resourceId,
        comment,
        userId,
      );

      await manager.softDelete(ResourceComment, { id: commentId, threadId });
      const remaining = await manager.getRepository(ResourceComment).count({
        where: { threadId },
      });
      if (remaining === 0) {
        await manager.softDelete(ResourceCommentThread, { id: thread.id });
        return null;
      }
      return await this.queriesService.getThreadResponse(manager, threadId);
    });
  }

  // Persists a new comment inside the current transaction.
  private async saveComment(
    manager: EntityManager,
    namespaceId: string,
    resourceId: string,
    threadId: string,
    authorId: string,
    content: string | undefined,
    attachmentIds?: string[],
  ): Promise<void> {
    const trimmedContent = content?.trim() ?? '';
    const uniqueAttachmentIds = [...new Set(attachmentIds ?? [])];
    if (!trimmedContent && uniqueAttachmentIds.length === 0) {
      throw new AppException(
        this.i18n.t('resourceComment.errors.emptyComment'),
        'EMPTY_COMMENT',
        HttpStatus.BAD_REQUEST,
      );
    }
    const comment = await manager.save(
      manager.getRepository(ResourceComment).create({
        threadId,
        authorId,
        content: trimmedContent,
      }),
    );
    await this.attachmentsService.bindAttachments(
      manager,
      namespaceId,
      resourceId,
      authorId,
      comment.id,
      uniqueAttachmentIds,
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
    if (!thread) {
      throw this.threadNotFoundException();
    }
    return thread;
  }

  // Allows thread moderation by the creator or a resource editor.
  private async assertCanModerate(
    thread: ResourceCommentThread,
    userId: string,
  ): Promise<void> {
    if (thread.creatorId === userId) {
      return;
    }
    const canEdit = await this.permissionsService.userHasPermission(
      thread.namespaceId,
      thread.resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!canEdit) {
      throw this.notAuthorizedException();
    }
  }

  // Allows comment deletion by the author or a resource editor.
  private async assertCanDeleteComment(
    namespaceId: string,
    resourceId: string,
    comment: ResourceComment,
    userId: string,
  ): Promise<void> {
    if (comment.authorId === userId) {
      return;
    }
    const canEdit = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!canEdit) {
      throw this.notAuthorizedException();
    }
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
