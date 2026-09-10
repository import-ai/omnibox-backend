import { buffer } from 'node:stream/consumers';

import { HttpStatus, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import { S3Service } from 'omniboxd/s3/s3.service';
import {
  encodeFileName,
  getOriginalFileName,
} from 'omniboxd/utils/encode-filename';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';

import { AttachmentLlmUrlResponseDto } from './dto/attachment-response.dto';
import { ConversationAttachment } from './entities/conversation-attachment.entity';
import { ConversationAttachmentResource } from './entities/conversation-attachment-resource.entity';

@Injectable()
export class ConversationAttachmentsService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly i18n: I18nService,
    private readonly permissionsService: PermissionsService,
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
    @InjectRepository(ConversationAttachment)
    private readonly conversationAttachmentRepository: Repository<ConversationAttachment>,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
  ) {}

  async uploadConversationAttachment(
    namespaceId: string,
    conversationId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, namespaceId, userId },
    });
    if (!conversation)
      throw new AppException(
        this.i18n.t('conversation.errors.accessDenied'),
        'CONVERSATION_ACCESS_DENIED',
        HttpStatus.FORBIDDEN,
      );
    if (!file)
      throw new AppException(
        this.i18n.t('attachment.errors.fileRequired'),
        'ATTACHMENT_FILE_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    const filename = encodeFileName(getOriginalFileName(file.originalname));
    const { objectKey } = await this.s3Service.generateObjectKey(
      'conversation-tempfiles',
      filename,
    );
    await this.s3Service.putObject(objectKey, file.buffer, file.mimetype, {
      filename,
    });
    const attachment = await this.conversationAttachmentRepository.save(
      this.conversationAttachmentRepository.create({
        namespaceId,
        conversationId,
        userId,
        objectKey,
        name: getOriginalFileName(file.originalname),
        contentType: file.mimetype,
        size: String(file.size),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: null,
      }),
    );
    return {
      attachment_id: attachment.id,
      name: attachment.name,
      preview_url: `/api/v1/namespaces/${namespaceId}/conversations/${conversationId}/attachments/${attachment.id}`,
    };
  }

  async promoteConversationAttachment(
    namespaceId: string,
    conversationId: string,
    attachmentId: string,
    resourceId: string,
    userId: string,
  ) {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    return await transaction(
      this.conversationAttachmentRepository.manager,
      async (tx) => {
        const manager = tx.entityManager;
        const attachment = await manager
          .getRepository(ConversationAttachment)
          .findOne({
            where: { id: attachmentId, namespaceId, conversationId, userId },
            lock: { mode: 'pessimistic_write' },
          });
        if (
          !attachment ||
          (!attachment.consumedAt && attachment.expiresAt <= new Date())
        ) {
          throw new AppException(
            this.i18n.t('attachment.errors.conversationAttachmentUnavailable'),
            'CONVERSATION_ATTACHMENT_ACCESS_DENIED',
            HttpStatus.FORBIDDEN,
          );
        }
        const mappings = manager.getRepository(ConversationAttachmentResource);
        const existing = await mappings.findOne({
          where: { conversationAttachmentId: attachmentId, resourceId },
        });
        if (existing) {
          const relation =
            await this.resourceAttachmentsService.getResourceAttachment(
              namespaceId,
              resourceId,
              existing.attachmentId,
            );
          if (relation) return { attachment_id: existing.attachmentId };
        }
        const { stream } = await this.s3Service.getObject(attachment.objectKey);
        const contents = await buffer(stream);
        const { objectKey, objectName } =
          await this.s3Service.generateObjectKey(
            'attachments',
            attachment.name,
          );
        await this.s3Service.putObject(
          objectKey,
          contents,
          attachment.contentType,
          {
            filename: encodeFileName(attachment.name),
          },
        );
        try {
          await this.resourceAttachmentsService.addAttachmentToResource(
            namespaceId,
            resourceId,
            objectName,
            userId,
            contents.length,
            tx,
          );
          await mappings.save(
            mappings.create({
              conversationAttachmentId: attachmentId,
              resourceId,
              attachmentId: objectName,
            }),
          );
        } catch (error) {
          await this.s3Service.deleteObject(objectKey);
          throw error;
        }
        return { attachment_id: objectName };
      },
    );
  }

  async downloadConversationAttachment(
    namespaceId: string,
    conversationId: string,
    attachmentId: string,
    userId: string,
    response: Response,
  ) {
    const attachment = await this.conversationAttachmentRepository.findOne({
      where: { id: attachmentId, namespaceId, conversationId, userId },
    });
    if (
      !attachment ||
      (!attachment.consumedAt && attachment.expiresAt <= new Date())
    )
      throw new AppException(
        this.i18n.t('attachment.errors.conversationAttachmentUnavailable'),
        'CONVERSATION_ATTACHMENT_ACCESS_DENIED',
        HttpStatus.FORBIDDEN,
      );
    const { stream, meta } = await this.s3Service.getObject(
      attachment.objectKey,
    );
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.setHeader(
      'Content-Type',
      meta.contentType || 'application/octet-stream',
    );
    response.setHeader('Content-Disposition', 'attachment');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    stream.pipe(response);
  }

  private async signObjectUrlForLlm(objectKey: string): Promise<string | null> {
    if (!this.s3Service.hasDistinctPublicEndpoint()) {
      return null;
    }
    return this.s3Service.generateDownloadUrl(objectKey, true);
  }

  async getConversationAttachmentLlmUrl(
    namespaceId: string,
    conversationId: string,
    attachmentId: string,
    userId: string,
  ): Promise<AttachmentLlmUrlResponseDto> {
    const attachment = await this.conversationAttachmentRepository.findOne({
      where: { id: attachmentId, namespaceId, conversationId, userId },
    });
    const now = new Date();
    if (
      !attachment ||
      (!attachment.consumedAt && attachment.expiresAt <= now)
    ) {
      throw new AppException(
        this.i18n.t('attachment.errors.conversationAttachmentUnavailable'),
        'CONVERSATION_ATTACHMENT_ACCESS_DENIED',
        HttpStatus.FORBIDDEN,
      );
    }
    return {
      id: attachment.id,
      name: attachment.name,
      content_type: attachment.contentType,
      url: await this.signObjectUrlForLlm(attachment.objectKey),
    };
  }

  @Cron('0 * * * *')
  async cleanupExpiredConversationAttachments() {
    const now = new Date();
    const expired = await this.conversationAttachmentRepository.find({
      where: { consumedAt: IsNull(), expiresAt: LessThanOrEqual(now) },
      select: { id: true },
    });
    for (const candidate of expired) {
      await this.conversationAttachmentRepository.manager.transaction(
        async (manager) => {
          const repository = manager.getRepository(ConversationAttachment);
          const attachment = await repository.findOne({
            where: {
              id: candidate.id,
              consumedAt: IsNull(),
              expiresAt: LessThanOrEqual(now),
            },
            lock: { mode: 'pessimistic_write' },
          });
          if (!attachment) return;
          await this.s3Service.deleteObject(attachment.objectKey);
          await repository.softDelete(attachment.id);
        },
      );
    }
  }
}
