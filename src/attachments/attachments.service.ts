import { buffer } from 'node:stream/consumers';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import { ObjectMeta, S3Service } from 'omniboxd/s3/s3.service';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { nullableBigintStringToNumber } from 'omniboxd/utils/bigint-utils';
import {
  encodeFileName,
  getOriginalFileName,
} from 'omniboxd/utils/encode-filename';
import { Readable } from 'stream';
import { In, IsNull, Repository } from 'typeorm';

import {
  AttachmentLlmUrlResponseDto,
  AttachmentResponseDto,
  ListAttachmentsResponseDto,
} from './dto/attachment-response.dto';
import {
  UploadAttachmentsResponseDto,
  UploadedAttachmentDto,
} from './dto/upload-attachments-response.dto';
import { ConversationAttachment } from './entities/conversation-attachment.entity';
import { ConversationAttachmentResource } from './entities/conversation-attachment-resource.entity';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly permissionsService: PermissionsService,
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
    private readonly sharedResourcesService: SharedResourcesService,
    @InjectRepository(ConversationAttachment)
    private readonly conversationAttachmentRepository: Repository<ConversationAttachment>,
    @InjectRepository(ConversationAttachmentResource)
    private readonly conversationAttachmentResourceRepository: Repository<ConversationAttachmentResource>,
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
    if (!conversation) throw new Error('Conversation not found');
    if (!file) throw new Error('Attachment file is required');
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
    const attachment = await this.conversationAttachmentRepository.findOne({
      where: { id: attachmentId, namespaceId, conversationId, userId },
    });
    if (
      !attachment ||
      (!attachment.consumedAt && attachment.expiresAt < new Date())
    ) {
      throw new Error('Conversation attachment is unavailable');
    }
    const existing =
      await this.conversationAttachmentResourceRepository.findOne({
        where: { conversationAttachmentId: attachmentId, resourceId },
      });
    if (existing) return { attachment_id: existing.attachmentId };
    const { stream } = await this.s3Service.getObject(attachment.objectKey);
    const contents = await buffer(stream);
    const { objectKey, objectName } = await this.s3Service.generateObjectKey(
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
    await this.resourceAttachmentsService.addAttachmentToResource(
      namespaceId,
      resourceId,
      objectName,
      userId,
      contents.length,
    );
    await this.conversationAttachmentResourceRepository.save(
      this.conversationAttachmentResourceRepository.create({
        conversationAttachmentId: attachmentId,
        resourceId,
        attachmentId: objectName,
      }),
    );
    return { attachment_id: objectName };
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
    if (!attachment) throw new Error('Conversation attachment not found');
    const { stream, meta } = await this.s3Service.getObject(
      attachment.objectKey,
    );
    this.objectStreamResponse(stream, meta, response, false, false);
  }

  async signConversationImageUrls(
    namespaceId: string,
    conversationId: string,
    userId: string,
    images?: { attachment_id: string; url: string; name: string }[],
  ) {
    if (!images?.length) {
      return images;
    }
    const attachmentIds = [
      ...new Set(images.map((image) => image.attachment_id)),
    ];
    const attachments = await this.conversationAttachmentRepository.find({
      where: {
        id: In(attachmentIds),
        namespaceId,
        conversationId,
        userId,
      },
    });
    const attachmentsById = new Map(
      attachments.map((attachment) => [attachment.id, attachment]),
    );
    if (!this.s3Service.hasDistinctPublicEndpoint()) {
      throw new AppException(
        'S3 public endpoint is not configured',
        'S3_PUBLIC_ENDPOINT_NOT_CONFIGURED',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const now = new Date();
    const signedImages: { attachment_id: string; url: string; name: string }[] =
      [];
    for (const image of images) {
      const attachment = attachmentsById.get(image.attachment_id);
      if (
        !attachment ||
        (!attachment.consumedAt && attachment.expiresAt <= now)
      ) {
        throw new AppException(
          'Attachment does not belong to this conversation',
          'CONVERSATION_ATTACHMENT_ACCESS_DENIED',
          HttpStatus.FORBIDDEN,
        );
      }
      signedImages.push({
        attachment_id: image.attachment_id,
        url: await this.s3Service.generateDownloadUrl(
          attachment.objectKey,
          true,
        ),
        name: image.name,
      });
    }
    return signedImages;
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
        'Attachment does not belong to this conversation',
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

  async getResourceAttachmentLlmUrl(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
  ): Promise<AttachmentLlmUrlResponseDto> {
    const info = await this.getAttachmentInfo(
      namespaceId,
      resourceId,
      attachmentId,
      userId,
      '',
    );
    return {
      id: info.id,
      name: info.name,
      content_type: info.content_type,
      url: await this.signObjectUrlForLlm(this.s3Path(attachmentId)),
    };
  }

  async getResourceAttachmentLlmUrlViaShare(
    share: Share,
    resourceId: string,
    attachmentId: string,
  ): Promise<AttachmentLlmUrlResponseDto> {
    const info = await this.getAttachmentInfoViaShare(
      share,
      resourceId,
      attachmentId,
      '',
    );
    return {
      id: info.id,
      name: info.name,
      content_type: info.content_type,
      url: await this.signObjectUrlForLlm(this.s3Path(attachmentId)),
    };
  }

  @Cron('0 * * * *')
  async cleanupExpiredConversationAttachments() {
    const expired = await this.conversationAttachmentRepository.find({
      where: { consumedAt: IsNull() },
    });
    const now = new Date();
    for (const attachment of expired.filter((item) => item.expiresAt <= now)) {
      await this.s3Service.deleteObject(attachment.objectKey);
      await this.conversationAttachmentRepository.softDelete(attachment.id);
    }
  }

  private s3Path(attachmentId: string): string {
    return `attachments/${attachmentId}`;
  }

  private isMedia(mimetype?: string): boolean {
    for (const type of ['image/', 'audio/']) {
      if (mimetype?.startsWith(type)) {
        return true;
      }
    }
    return false;
  }

  private objectStreamResponse(
    objectStream: Readable,
    objectMeta: ObjectMeta,
    httpResponse: Response,
    cacheControl: boolean = true,
    forceDownload: boolean = true,
  ) {
    const headers: Record<string, string> = {};
    if (objectMeta.metadata?.filename) {
      const disposition = forceDownload ? 'attachment' : 'inline';
      headers['Content-Disposition'] =
        `${disposition}; filename*=UTF-8''${encodeURIComponent(objectMeta.metadata.filename)}`;
    }
    if (objectMeta.contentType) {
      headers['Content-Type'] = objectMeta.contentType;
    }
    if (objectMeta.contentLength) {
      headers['Content-Length'] = objectMeta.contentLength.toString();
    }
    if (objectMeta.lastModified) {
      headers['Last-Modified'] = objectMeta.lastModified.toUTCString();
    }
    if (cacheControl) {
      headers['Cache-Control'] = 'public, max-age=31536000'; // 1 year
    } else {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }
    for (const [key, value] of Object.entries(headers)) {
      httpResponse.setHeader(key, value);
    }
    objectStream.pipe(httpResponse);
  }

  async uploadAttachment(
    namespaceId: string,
    resourceId: string,
    userId: string,
    filename: string,
    buffer: Buffer,
    mimetype: string,
  ) {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );

    const { objectKey, objectName } = await this.s3Service.generateObjectKey(
      'attachments',
      filename,
    );
    const metadata = {
      filename: encodeFileName(filename),
    };
    await this.s3Service.putObject(objectKey, buffer, mimetype, metadata);

    // Create the resource-attachment relation
    await this.resourceAttachmentsService.addAttachmentToResource(
      namespaceId,
      resourceId,
      objectName,
      userId,
      buffer.length,
    );

    return objectName;
  }

  async uploadAttachments(
    namespaceId: string,
    resourceId: string,
    userId: string,
    files: Express.Multer.File[],
  ): Promise<UploadAttachmentsResponseDto> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    const failed: string[] = [];
    const uploaded: UploadedAttachmentDto[] = [];

    for (const file of files) {
      const originalName = getOriginalFileName(file.originalname); // Get corrected original name
      try {
        const filename: string = encodeFileName(file.originalname);
        const id = await this.uploadAttachment(
          namespaceId,
          resourceId,
          userId,
          filename,
          file.buffer,
          file.mimetype,
        );
        uploaded.push({
          name: originalName, // Use corrected original name in response
          link: id,
        });
      } catch (error) {
        this.logger.error({ error });
        failed.push(originalName); // Use corrected original name in failed array
      }
    }

    return {
      namespaceId,
      resourceId,
      uploaded,
      failed,
    };
  }

  private async listAttachmentMetadata(
    namespaceId: string,
    resourceId: string,
    downloadUrl: (attachmentId: string) => string,
    offset: number,
    limit: number,
  ): Promise<ListAttachmentsResponseDto> {
    const result =
      await this.resourceAttachmentsService.listResourceAttachmentsWithTotal(
        namespaceId,
        resourceId,
        Math.max(0, offset),
        Math.min(100, Math.max(1, limit)),
      );
    const attachments = await Promise.all(
      result.attachments.map(
        async (relation): Promise<AttachmentResponseDto> => {
          const meta = await this.s3Service.headObject(
            this.s3Path(relation.attachmentId),
          );
          return {
            id: relation.attachmentId,
            name:
              getOriginalFileName(meta?.metadata?.filename) ||
              relation.attachmentId,
            content_type: meta?.contentType ?? null,
            size:
              meta?.contentLength ??
              nullableBigintStringToNumber(relation.attachmentSize) ??
              0,
            download_url: downloadUrl(relation.attachmentId),
          };
        },
      ),
    );
    return { attachments, total: result.total };
  }

  async listAttachments(
    namespaceId: string,
    resourceId: string,
    userId: string,
    downloadUrl: (attachmentId: string) => string,
    offset: number = 0,
    limit: number = 20,
  ): Promise<ListAttachmentsResponseDto> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );
    return await this.listAttachmentMetadata(
      namespaceId,
      resourceId,
      downloadUrl,
      offset,
      limit,
    );
  }

  async listAttachmentsViaShare(
    share: Share,
    resourceId: string,
    downloadUrl: (attachmentId: string) => string,
    offset: number = 0,
    limit: number = 20,
  ): Promise<ListAttachmentsResponseDto> {
    await this.sharedResourcesService.getAndValidateResource(share, resourceId);
    return await this.listAttachmentMetadata(
      share.namespaceId,
      resourceId,
      downloadUrl,
      offset,
      limit,
    );
  }

  private async getAttachmentMetadata(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    downloadUrl: string,
  ): Promise<AttachmentResponseDto> {
    const relation =
      await this.resourceAttachmentsService.getResourceAttachmentOrFail(
        namespaceId,
        resourceId,
        attachmentId,
      );
    const meta = await this.s3Service.headObject(this.s3Path(attachmentId));
    return {
      id: attachmentId,
      name: getOriginalFileName(meta?.metadata?.filename) || attachmentId,
      content_type: meta?.contentType ?? null,
      size:
        meta?.contentLength ??
        nullableBigintStringToNumber(relation.attachmentSize) ??
        0,
      download_url: downloadUrl,
    };
  }

  async getAttachmentInfo(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
    downloadUrl: string,
  ): Promise<AttachmentResponseDto> {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );
    return await this.getAttachmentMetadata(
      namespaceId,
      resourceId,
      attachmentId,
      downloadUrl,
    );
  }

  async getAttachmentInfoViaShare(
    share: Share,
    resourceId: string,
    attachmentId: string,
    downloadUrl: string,
  ): Promise<AttachmentResponseDto> {
    await this.sharedResourcesService.getAndValidateResource(share, resourceId);
    return await this.getAttachmentMetadata(
      share.namespaceId,
      resourceId,
      attachmentId,
      downloadUrl,
    );
  }

  async downloadAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
    httpResponse: Response,
  ) {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );

    await this.resourceAttachmentsService.getResourceAttachmentOrFail(
      namespaceId,
      resourceId,
      attachmentId,
    );

    const { stream, meta } = await this.s3Service.getObject(
      this.s3Path(attachmentId),
    );
    const forceDownload = !this.isMedia(meta.contentType);
    this.objectStreamResponse(stream, meta, httpResponse, true, forceDownload);
  }

  async deleteAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.permissionsService.userHasPermissionOrFail(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );

    await this.resourceAttachmentsService.removeAttachmentFromResource(
      namespaceId,
      resourceId,
      attachmentId,
      userId,
    );

    return {
      id: attachmentId,
      success: true,
    };
  }

  async downloadAttachmentViaShare(
    share: Share,
    resourceId: string,
    attachmentId: string,
    httpResponse: Response,
  ) {
    await this.sharedResourcesService.getAndValidateResource(share, resourceId);
    await this.resourceAttachmentsService.getResourceAttachmentOrFail(
      share.namespaceId,
      resourceId,
      attachmentId,
    );
    const { stream, meta } = await this.s3Service.getObject(
      this.s3Path(attachmentId),
    );
    const forceDownload = !this.isMedia(meta.contentType);
    this.objectStreamResponse(stream, meta, httpResponse, true, forceDownload);
  }
}
