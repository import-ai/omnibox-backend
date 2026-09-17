import { buffer } from 'node:stream/consumers';

import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ObjectMeta, S3Service } from 'omniboxd/s3/s3.service';
import { StorageType } from 'omniboxd/storage-usages/entities/storage-usage.entity';
import { StorageUsagesService } from 'omniboxd/storage-usages/storage-usages.service';
import {
  encodeFileName,
  getOriginalFileName,
} from 'omniboxd/utils/encode-filename';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { Readable } from 'stream';
import { EntityManager, In, IsNull, Not, Repository } from 'typeorm';

import {
  COMMENT_IMAGE_MAX_SIZE,
  COMMENT_IMAGE_TYPES,
  detectCommentImageType,
} from './comment-image';
import { ResourceCommentAttachmentUploadResponseDto } from './dto/resource-comment-response.dto';
import { ResourceCommentAttachment } from './entities/resource-comment-attachment.entity';

@Injectable()
export class ResourceCommentAttachmentsService {
  constructor(
    @InjectRepository(ResourceCommentAttachment)
    private readonly attachmentRepository: Repository<ResourceCommentAttachment>,
    private readonly permissionsService: PermissionsService,
    private readonly s3Service: S3Service,
    private readonly storageUsagesService: StorageUsagesService,
    private readonly i18n: I18nService,
  ) {}

  async uploadAttachment(
    namespaceId: string,
    resourceId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<ResourceCommentAttachmentUploadResponseDto> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_COMMENT,
    );
    const mimetype = file?.buffer && detectCommentImageType(file.buffer);
    if (
      !mimetype ||
      mimetype !== file.mimetype ||
      file.buffer.length > COMMENT_IMAGE_MAX_SIZE
    ) {
      throw new AppException(
        this.i18n.t('resourceComment.errors.invalidAttachment'),
        'INVALID_COMMENT_ATTACHMENT',
        HttpStatus.BAD_REQUEST,
      );
    }
    const name = getOriginalFileName(file.originalname);
    const { objectKey } = await this.s3Service.generateObjectKey(
      'comment-attachments',
      encodeFileName(file.originalname),
    );
    // Reserve the ledger and durable cleanup record before writing S3. Failed or
    // interrupted uploads stay unbindable and are reclaimed by the same worker.
    const attachment = await transaction(
      this.attachmentRepository.manager,
      async (tx) => {
        await tx.entityManager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`comment-storage:${namespaceId}:${userId}`],
        );
        const repository = tx.entityManager.getRepository(
          ResourceCommentAttachment,
        );
        const attachment = await repository.save(
          repository.create({
            namespaceId,
            resourceId,
            uploaderId: userId,
            storageUserId: userId,
            commentId: null,
            objectKey,
            name,
            mimetype,
            size: file.buffer.length,
            uploadedAt: null,
          }),
        );
        await this.storageUsagesService.updateStorageUsage(
          namespaceId,
          userId,
          StorageType.ATTACHMENT,
          attachment.size,
          tx,
        );
        return attachment;
      },
    );
    await this.attachmentRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ResourceCommentAttachment);
      // A resource can be deleted while S3 is receiving bytes. Cleanup must not
      // remove this record until the write either completes or fails.
      await repository.findOneOrFail({
        where: { id: attachment.id },
        lock: { mode: 'pessimistic_write' },
      });
      await this.s3Service.putObject(objectKey, file.buffer, mimetype, {
        filename: encodeFileName(file.originalname),
      });
      await repository.update(attachment.id, { uploadedAt: new Date() });
    });
    return {
      id: attachment.id,
      url: `/api/v1/namespaces/${namespaceId}/resources/${resourceId}/comment-attachments/${attachment.id}`,
      name,
      mimetype,
      size: attachment.size,
    };
  }

  async downloadAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
    httpResponse: Response,
  ): Promise<void> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );
    const attachment = await this.attachmentRepository.findOne({
      where: { id: attachmentId, namespaceId, resourceId },
    });
    await this.streamAttachment(attachment, httpResponse);
  }

  // The caller validates the share and resource; only published attachments are visible.
  async downloadSharedAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    httpResponse: Response,
  ): Promise<void> {
    const attachment = await this.attachmentRepository.findOne({
      where: {
        id: attachmentId,
        namespaceId,
        resourceId,
        comment: { thread: { namespaceId, resourceId } },
      },
    });
    await this.streamAttachment(attachment, httpResponse, 'private, no-store');
  }

  private async streamAttachment(
    attachment: ResourceCommentAttachment | null,
    httpResponse: Response,
    cacheControl = 'private, max-age=31536000',
  ): Promise<void> {
    if (!attachment) {
      throw new AppException(
        this.i18n.t('resourceComment.errors.attachmentNotFound'),
        'COMMENT_ATTACHMENT_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    const { stream, meta } = await this.s3Service.getObject(
      attachment.objectKey,
    );
    if (
      !attachment.uploadedAt &&
      meta.contentLength !== undefined &&
      meta.contentLength <= COMMENT_IMAGE_MAX_SIZE
    ) {
      const bytes = await buffer(stream);
      this.writeAttachmentResponse(
        Readable.from(bytes),
        meta,
        attachment,
        httpResponse,
        cacheControl,
        detectCommentImageType(bytes),
      );
      return;
    }
    this.writeAttachmentResponse(
      stream,
      meta,
      attachment,
      httpResponse,
      cacheControl,
    );
  }

  async replaceAttachments(
    manager: EntityManager,
    namespaceId: string,
    resourceId: string,
    userId: string,
    commentId: string,
    currentAttachments: ResourceCommentAttachment[],
    attachmentIds: string[],
  ): Promise<void> {
    const nextIds = new Set(attachmentIds);
    const currentIds = new Set(
      currentAttachments.map((attachment) => attachment.id),
    );
    const removed = currentAttachments.filter(
      (attachment) => !nextIds.has(attachment.id),
    );
    for (const attachment of removed) {
      attachment.commentId = null;
      attachment.deletedAt = new Date();
    }
    if (removed.length) {
      await manager.save(removed);
    }
    await this.bindAttachments(
      manager,
      namespaceId,
      resourceId,
      userId,
      commentId,
      attachmentIds.filter((id) => !currentIds.has(id)),
    );
  }

  async bindAttachments(
    manager: EntityManager,
    namespaceId: string,
    resourceId: string,
    userId: string,
    commentId: string,
    attachmentIds: string[],
  ): Promise<void> {
    if (attachmentIds.length === 0) {
      return;
    }
    const attachments = await manager
      .getRepository(ResourceCommentAttachment)
      .find({
        where: {
          id: In(attachmentIds),
          namespaceId,
          resourceId,
          uploaderId: userId,
          commentId: IsNull(),
          uploadedAt: Not(IsNull()),
        },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
    if (attachments.length !== attachmentIds.length) {
      throw new AppException(
        this.i18n.t('resourceComment.errors.invalidAttachment'),
        'INVALID_COMMENT_ATTACHMENT',
        HttpStatus.BAD_REQUEST,
      );
    }
    for (const attachment of attachments) {
      attachment.commentId = commentId;
    }
    await manager.save(attachments);
  }

  private writeAttachmentResponse(
    objectStream: Readable,
    objectMeta: ObjectMeta,
    attachment: ResourceCommentAttachment,
    httpResponse: Response,
    cacheControl: string,
    verifiedType?: string | null,
  ): void {
    // Historical images are checked on read; never promote an unknown type
    // based only on client MIME or object metadata.
    const mimetype =
      verifiedType ??
      (attachment.uploadedAt && COMMENT_IMAGE_TYPES.has(attachment.mimetype)
        ? attachment.mimetype
        : null);
    const canInline = !!mimetype;
    httpResponse.setHeader(
      'Content-Disposition',
      `${canInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    );
    httpResponse.setHeader(
      'Content-Type',
      mimetype ?? 'application/octet-stream',
    );
    httpResponse.setHeader('X-Content-Type-Options', 'nosniff');
    httpResponse.setHeader(
      'Content-Security-Policy',
      "sandbox; default-src 'none'",
    );
    if (objectMeta.contentLength !== undefined) {
      httpResponse.setHeader(
        'Content-Length',
        objectMeta.contentLength.toString(),
      );
    }
    httpResponse.setHeader('Cache-Control', cacheControl);
    objectStream.pipe(httpResponse);
  }
}
