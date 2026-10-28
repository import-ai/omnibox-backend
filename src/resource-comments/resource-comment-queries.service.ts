import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { EntityManager, Repository } from 'typeorm';

import { ListResourceCommentThreadsRequestDto } from './dto/resource-comment-request.dto';
import {
  ListResourceCommentThreadsResponseDto,
  ResourceCommentThreadResponseDto,
} from './dto/resource-comment-response.dto';
import {
  ResourceCommentThread,
  ResourceCommentThreadType,
} from './entities/resource-comment-thread.entity';
import { ResourceCommentAnchorsService } from './resource-comment-anchors.service';
@Injectable()
export class ResourceCommentQueriesService {
  constructor(
    @InjectRepository(ResourceCommentThread)
    private readonly threadRepository: Repository<ResourceCommentThread>,
    private readonly permissionsService: PermissionsService,
    private readonly anchorsService: ResourceCommentAnchorsService,
    private readonly i18n: I18nService,
  ) {}
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
      .leftJoinAndSelect('comment.attachments', 'attachment')
      .where('thread.namespace_id = :namespaceId', { namespaceId })
      .andWhere('thread.resource_id = :resourceId', { resourceId })
      .andWhere('thread.type = :type', {
        type: ResourceCommentThreadType.INLINE,
      })
      .orderBy('thread.created_at', 'ASC')
      .addOrderBy('comment.created_at', 'ASC')
      .addOrderBy('attachment.created_at', 'ASC')
      .getMany();

    return {
      content_hash: this.anchorsService.contentHash(content),
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
    enforcePermission = true,
  ): Promise<ListResourceCommentThreadsResponseDto> {
    if (enforcePermission) {
      await this.permissionsService.userHasPermissionOrFail(
        namespaceId,
        resourceId,
        userId,
        ResourcePermission.CAN_VIEW,
      );
    }

    // The page is cut on threads alone: paging the joined query would let a
    // thread with several comments take up more than one offset slot.
    const pageBuilder = this.threadRepository
      .createQueryBuilder('thread')
      .where('thread.namespace_id = :namespaceId', { namespaceId })
      .andWhere('thread.resource_id = :resourceId', { resourceId });
    if (query.view === 'sidebar') {
      pageBuilder.andWhere(
        "(thread.type = 'inline' OR (thread.type = 'document' AND thread.resolved_at IS NOT NULL))",
      );
    } else {
      pageBuilder.andWhere('thread.type = :type', {
        type:
          query.view === 'document'
            ? ResourceCommentThreadType.DOCUMENT
            : ResourceCommentThreadType.INLINE,
      });
    }
    if (query.resolved !== undefined) {
      pageBuilder.andWhere(
        query.resolved === 'true'
          ? 'thread.resolved_at IS NOT NULL'
          : 'thread.resolved_at IS NULL',
      );
    }
    const direction = query.view === undefined ? 'DESC' : 'ASC';
    if (query.view === 'sidebar') {
      pageBuilder.orderBy(
        "CASE WHEN thread.type = 'inline' THEN 0 ELSE 1 END",
        'ASC',
      );
      pageBuilder.addOrderBy('thread.created_at', direction);
    } else {
      pageBuilder.orderBy('thread.created_at', direction);
    }
    pageBuilder.addOrderBy('thread.id', direction);
    const [page, total] = await pageBuilder
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    const threads =
      page.length === 0
        ? []
        : await this.threadRepository
            .createQueryBuilder('thread')
            .leftJoinAndSelect('thread.creator', 'creator')
            .leftJoinAndSelect('thread.comments', 'comment')
            .leftJoinAndSelect('comment.author', 'author')
            .leftJoinAndSelect('comment.attachments', 'attachment')
            .where('thread.id IN (:...threadIds)', {
              threadIds: page.map((thread) => thread.id),
            })
            .orderBy('comment.created_at', 'ASC')
            .addOrderBy('comment.id', 'ASC')
            .addOrderBy('attachment.created_at', 'ASC')
            .getMany();

    // Hydration may produce a different order after joining comments; retain
    // the exact page order chosen before the joins.
    const pageOrder = new Map(page.map((thread, index) => [thread.id, index]));
    threads.sort(
      (left, right) => pageOrder.get(left.id)! - pageOrder.get(right.id)!,
    );
    return {
      items: threads.map((thread) =>
        ResourceCommentThreadResponseDto.fromEntity(thread),
      ),
      total,
      offset: query.offset,
      limit: query.limit,
      has_more: query.offset + threads.length < total,
    };
  }

  // Reads one scoped thread independently of the current list page.
  async getThread(
    namespaceId: string,
    resourceId: string,
    threadId: string,
    userId: string,
    enforcePermission = true,
  ): Promise<ResourceCommentThreadResponseDto> {
    if (enforcePermission) {
      await this.permissionsService.userHasPermissionOrFail(
        namespaceId,
        resourceId,
        userId,
        ResourcePermission.CAN_VIEW,
      );
    }
    const thread = await this.threadRepository
      .createQueryBuilder('thread')
      .leftJoinAndSelect('thread.creator', 'creator')
      .leftJoinAndSelect('thread.comments', 'comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.attachments', 'attachment')
      .where('thread.id = :threadId', { threadId })
      .andWhere('thread.namespace_id = :namespaceId', { namespaceId })
      .andWhere('thread.resource_id = :resourceId', { resourceId })
      .orderBy('comment.created_at', 'ASC')
      .addOrderBy('comment.id', 'ASC')
      .addOrderBy('attachment.created_at', 'ASC')
      .getOne();
    if (!thread) {
      throw this.threadNotFoundException();
    }
    return ResourceCommentThreadResponseDto.fromEntity(thread);
  }

  // Reloads a thread with its creator, comments, and comment authors.
  async getThreadResponse(
    manager: EntityManager,
    threadId: string,
  ): Promise<ResourceCommentThreadResponseDto> {
    const thread = await manager
      .getRepository(ResourceCommentThread)
      .createQueryBuilder('thread')
      .leftJoinAndSelect('thread.creator', 'creator')
      .leftJoinAndSelect('thread.comments', 'comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.attachments', 'attachment')
      .where('thread.id = :threadId', { threadId })
      .orderBy('comment.created_at', 'ASC')
      .addOrderBy('attachment.created_at', 'ASC')
      .getOne();
    if (!thread) {
      throw this.threadNotFoundException();
    }
    return ResourceCommentThreadResponseDto.fromEntity(thread);
  }

  // Builds the standard thread-not-found API exception.
  private threadNotFoundException(): AppException {
    return new AppException(
      this.i18n.t('resourceComment.errors.threadNotFound'),
      'COMMENT_THREAD_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  }
}
