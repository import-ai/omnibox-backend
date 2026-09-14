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
import { ResourceCommentThread } from './entities/resource-comment-thread.entity';
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

    const builder = this.threadRepository
      .createQueryBuilder('thread')
      .leftJoinAndSelect('thread.creator', 'creator')
      .leftJoinAndSelect('thread.comments', 'comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.attachments', 'attachment')
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
      .addOrderBy('attachment.createdAt', 'ASC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

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
