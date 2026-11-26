import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { resolveMemberDisplayNames } from 'omniboxd/namespaces/member-display-names';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { EntityManager, Repository } from 'typeorm';

import {
  OpenCommentPageRequestDto,
  OpenListCommentThreadsRequestDto,
} from './dto/open-resource-comment-request.dto';
import {
  OpenListCommentsResponseDto,
  OpenListCommentThreadsResponseDto,
  OpenResourceCommentResponseDto,
  OpenResourceCommentThreadResponseDto,
} from './dto/open-resource-comment-response.dto';
import { ResourceComment } from './entities/resource-comment.entity';
import { ResourceCommentThread } from './entities/resource-comment-thread.entity';
import { referencedMentionIds, referencedMentionNames } from './mention-labels';

@Injectable()
export class ResourceCommentOpenQueriesService {
  constructor(
    @InjectRepository(ResourceCommentThread)
    private readonly threadRepository: Repository<ResourceCommentThread>,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService,
  ) {}

  async listThreads(
    namespaceId: string,
    resourceId: string,
    userId: string,
    query: OpenListCommentThreadsRequestDto,
  ): Promise<OpenListCommentThreadsResponseDto> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );
    return this.threadRepository.manager.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const builder = manager
          .getRepository(ResourceCommentThread)
          .createQueryBuilder('thread')
          .where('thread.namespace_id = :namespaceId', { namespaceId })
          .andWhere('thread.resource_id = :resourceId', { resourceId });
        if (query.type !== 'all')
          builder.andWhere('thread.type = :type', { type: query.type });
        if (query.resolved !== undefined)
          builder.andWhere(
            query.resolved === 'true'
              ? 'thread.resolved_at IS NOT NULL'
              : 'thread.resolved_at IS NULL',
          );
        const [threads, total] = await builder
          .orderBy('thread.created_at', 'ASC')
          .addOrderBy('thread.id', 'ASC')
          .skip(query.offset)
          .take(query.limit)
          .getManyAndCount();
        if (!threads.length)
          return {
            items: [],
            total,
            offset: query.offset,
            limit: query.limit,
            has_more: false,
          };
        const ids = threads.map((thread) => thread.id);
        const counts = await manager.query<
          { thread_id: string; total: string }[]
        >(
          `
        SELECT c.thread_id, COUNT(*)::text AS total
        FROM resource_comments c JOIN resource_comment_threads t ON t.id = c.thread_id
        WHERE t.namespace_id = $1 AND t.resource_id = $2 AND t.id = ANY($3::uuid[])
          AND t.deleted_at IS NULL AND c.deleted_at IS NULL GROUP BY c.thread_id
      `,
          [namespaceId, resourceId, ids],
        );
        const countMap = new Map(
          counts.map((row) => [row.thread_id, this.safeCount(row.total)]),
        );
        const previews = await manager.query<
          { thread_id: string; comment_id: string | null }[]
        >(
          `
        SELECT t.id AS thread_id, preview.id AS comment_id
        FROM resource_comment_threads t
        LEFT JOIN LATERAL (
          SELECT c.id FROM resource_comments c
          WHERE c.thread_id = t.id AND c.deleted_at IS NULL
          ORDER BY c.created_at ASC, c.id ASC LIMIT 1
        ) preview ON TRUE
        WHERE t.namespace_id = $1 AND t.resource_id = $2 AND t.id = ANY($3::uuid[])
          AND t.deleted_at IS NULL
      `,
          [namespaceId, resourceId, ids],
        );
        const commentIds = previews.flatMap((row) =>
          row.comment_id ? [row.comment_id] : [],
        );
        const comments = await this.hydrate(
          manager,
          namespaceId,
          resourceId,
          commentIds,
        );
        const byThread = new Map(
          comments.map((comment) => [comment.threadId, comment]),
        );
        const names = await this.displayNames(
          manager,
          namespaceId,
          comments,
          threads.map((thread) => thread.creatorId),
        );
        return {
          items: threads.map((thread) =>
            OpenResourceCommentThreadResponseDto.fromEntity(
              thread,
              byThread.has(thread.id) ? [byThread.get(thread.id)!] : [],
              countMap.get(thread.id) ?? 0,
              names,
            ),
          ),
          total,
          offset: query.offset,
          limit: query.limit,
          has_more: query.offset + threads.length < total,
        };
      },
    );
  }

  async listComments(
    namespaceId: string,
    resourceId: string,
    threadId: string,
    userId: string,
    query: OpenCommentPageRequestDto,
  ): Promise<OpenListCommentsResponseDto> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );
    return this.threadRepository.manager.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const thread = await manager
          .getRepository(ResourceCommentThread)
          .findOneBy({ id: threadId, namespaceId, resourceId });
        if (!thread)
          throw new AppException(
            this.i18n.t('resourceComment.errors.threadNotFound'),
            'COMMENT_THREAD_NOT_FOUND',
            HttpStatus.NOT_FOUND,
          );
        const [page, total] = await manager
          .getRepository(ResourceComment)
          .createQueryBuilder('comment')
          .select(['comment.id', 'comment.createdAt'])
          .where('comment.thread_id = :threadId', { threadId })
          .orderBy('comment.created_at', 'ASC')
          .addOrderBy('comment.id', 'ASC')
          .skip(query.offset)
          .take(query.limit)
          .getManyAndCount();
        const comments = await this.hydrate(
          manager,
          namespaceId,
          resourceId,
          page.map((comment) => comment.id),
        );
        const names = await this.displayNames(manager, namespaceId, comments);
        return {
          items: comments.map((comment) =>
            OpenResourceCommentResponseDto.fromEntity(comment, names),
          ),
          total,
          offset: query.offset,
          limit: query.limit,
          has_more: query.offset + comments.length < total,
          mention_display_names: referencedMentionNames(
            comments.map((comment) => comment.content).join('\n'),
            names,
          ),
        };
      },
    );
  }

  private async hydrate(
    manager: EntityManager,
    namespaceId: string,
    resourceId: string,
    ids: string[],
  ): Promise<ResourceComment[]> {
    if (!ids.length) return [];
    const comments = await manager
      .getRepository(ResourceComment)
      .createQueryBuilder('comment')
      .innerJoin(
        'comment.thread',
        'thread',
        'thread.namespace_id = :namespaceId AND thread.resource_id = :resourceId',
        { namespaceId, resourceId },
      )
      .leftJoinAndSelect(
        'comment.attachments',
        'attachment',
        'attachment.namespace_id = :namespaceId AND attachment.resource_id = :resourceId',
        { namespaceId, resourceId },
      )
      .where('comment.id IN (:...ids)', { ids })
      .orderBy('attachment.created_at', 'ASC')
      .addOrderBy('attachment.id', 'ASC')
      .getMany();
    const order = new Map(ids.map((id, index) => [id, index]));
    return comments.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  private displayNames(
    manager: EntityManager,
    namespaceId: string,
    comments: ResourceComment[],
    creators: (string | null)[] = [],
  ) {
    return resolveMemberDisplayNames(manager, namespaceId, [
      ...creators.filter((id): id is string => Boolean(id)),
      ...comments.flatMap((comment) => [
        ...(comment.authorId ? [comment.authorId] : []),
        ...referencedMentionIds(comment.content),
      ]),
    ]);
  }

  private safeCount(value: string): number {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0)
      throw new RangeError('Comment count exceeds the supported range');
    return count;
  }
}
