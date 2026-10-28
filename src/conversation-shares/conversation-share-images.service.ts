import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { ConversationAttachment } from 'omniboxd/attachments/entities/conversation-attachment.entity';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Message } from 'omniboxd/messages/entities/message.entity';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import { S3Service } from 'omniboxd/s3/s3.service';
import { getOriginalFileName } from 'omniboxd/utils/encode-filename';
import { In, IsNull, Not, Repository } from 'typeorm';

import {
  type ConversationShareResourceImage,
  isSafeResourceImageId,
  resourceImageReferences,
} from './conversation-share-resource-images';
import {
  ConversationShare,
  ConversationShareStatus,
} from './entities/conversation-share.entity';
import { ConversationShareQuestionImage } from './entities/conversation-share-group.entity';

const SHAREABLE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);
const ATTACHMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ConversationShareImagesService {
  constructor(
    @InjectRepository(ConversationShare)
    private readonly shareRepo: Repository<ConversationShare>,
    @InjectRepository(ConversationAttachment)
    private readonly attachmentRepo: Repository<ConversationAttachment>,
    private readonly s3Service: S3Service,
    private readonly permissionsService: PermissionsService,
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
  ) {}

  async questionImages(
    namespaceId: string,
    conversationId: string,
    userId: string,
    questions: readonly Message[],
  ): Promise<ConversationShareQuestionImage[][]> {
    const attachmentIds = [
      ...new Set(questions.flatMap((question) => this.imageRefs(question))),
    ];
    if (attachmentIds.length === 0) {
      return questions.map(() => []);
    }

    const attachments = await this.attachmentRepo.find({
      where: {
        id: In(attachmentIds),
        namespaceId,
        conversationId,
        userId,
        consumedAt: Not(IsNull()),
      },
    });
    const imagesById = new Map(
      attachments
        .filter((attachment) => this.shareableImageType(attachment.contentType))
        .map((attachment) => [attachment.id, attachment]),
    );
    return questions.map((question) =>
      this.imageRefs(question).flatMap((attachmentId) => {
        const attachment = imagesById.get(attachmentId);
        if (!attachment) return [];
        return [{ attachmentId: attachment.id, name: attachment.name }];
      }),
    );
  }

  async resourceImages(
    namespaceId: string,
    userId: string,
    contents: readonly string[],
  ): Promise<ConversationShareResourceImage[]> {
    const images: ConversationShareResourceImage[] = [];
    const seen = new Set<string>();
    for (const content of contents) {
      for (const reference of resourceImageReferences(namespaceId, content)) {
        const referenceKey = `${reference.resourceId}\0${reference.attachmentId}`;
        if (seen.has(referenceKey)) continue;
        const image = await this.approvedResourceImage(
          namespaceId,
          userId,
          reference.resourceId,
          reference.attachmentId,
        );
        if (!image) {
          seen.add(referenceKey);
          continue;
        }
        const canonicalKey = `${image.resourceId}\0${image.attachmentId}`;
        seen.add(referenceKey);
        if (canonicalKey !== referenceKey && seen.has(canonicalKey)) continue;
        seen.add(canonicalKey);
        images.push(image);
      }
    }
    return images;
  }

  async streamQuestionImage(
    shareId: string,
    attachmentId: string,
    response: Response,
  ) {
    if (!ATTACHMENT_ID.test(attachmentId)) {
      throw this.notFound();
    }
    const share = await this.activeShare(shareId);
    const listed = share?.groups.some((group) =>
      (group.questionImages ?? []).some(
        (image) => image.attachmentId === attachmentId,
      ),
    );
    if (!share || !listed) {
      throw this.notFound();
    }

    const attachment = await this.attachmentRepo.findOne({
      where: {
        id: attachmentId,
        namespaceId: share.namespaceId,
        conversationId: share.sourceConversationId,
        userId: share.userId,
        consumedAt: Not(IsNull()),
      },
    });
    const contentType = this.shareableImageType(attachment?.contentType);
    if (!attachment || !contentType) {
      throw this.notFound();
    }

    const { stream, meta } = await this.s3Service.getObject(
      attachment.objectKey,
    );
    this.assertObjectType(stream, meta.contentType, contentType);
    this.writeInlineImage(response, stream, contentType);
  }

  async streamResourceImage(
    shareId: string,
    attachmentId: string,
    response: Response,
  ) {
    if (!isSafeResourceImageId(attachmentId)) {
      throw this.notFound();
    }
    const share = await this.activeShare(shareId);
    const listed = share?.groups
      .flatMap((group) => group.resourceImages ?? [])
      .find((image) => image.attachmentId === attachmentId);
    if (!share || !listed) {
      throw this.notFound();
    }

    let relation: { attachmentId: string };
    try {
      relation =
        await this.resourceAttachmentsService.getResourceAttachmentOrFail(
          share.namespaceId,
          listed.resourceId,
          attachmentId,
        );
    } catch {
      throw this.notFound();
    }
    const objectKey = `attachments/${relation.attachmentId}`;
    const meta = await this.s3Service.headObject(objectKey);
    const contentType = this.shareableImageType(meta?.contentType);
    if (!contentType) {
      throw this.notFound();
    }
    const object = await this.s3Service.getObject(objectKey);
    this.assertObjectType(object.stream, object.meta.contentType, contentType);
    this.writeInlineImage(response, object.stream, contentType);
  }

  private async activeShare(shareId: string) {
    return await this.shareRepo.findOne({
      where: { id: shareId, status: ConversationShareStatus.ACTIVE },
      relations: { groups: true },
    });
  }

  private async approvedResourceImage(
    namespaceId: string,
    userId: string,
    resourceId: string,
    attachmentId: string,
  ): Promise<ConversationShareResourceImage | null> {
    try {
      const allowed = await this.permissionsService.userHasPermission(
        namespaceId,
        resourceId,
        userId,
        ResourcePermission.CAN_VIEW,
      );
      if (!allowed) return null;
      const relation =
        await this.resourceAttachmentsService.getResourceAttachmentOrFail(
          namespaceId,
          resourceId,
          attachmentId,
        );
      if (!isSafeResourceImageId(relation.attachmentId)) return null;
      const meta = await this.s3Service.headObject(
        `attachments/${relation.attachmentId}`,
      );
      if (!this.shareableImageType(meta?.contentType)) return null;
      return {
        resourceId,
        attachmentId: relation.attachmentId,
        name:
          getOriginalFileName(meta?.metadata?.filename) ||
          relation.attachmentId,
      };
    } catch {
      return null;
    }
  }

  private imageRefs(message: Message) {
    const parts = message.attrs?.composer?.display_parts;
    if (!Array.isArray(parts)) return [];

    const ids: string[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
      const attachmentId = part?.attachment_id;
      if (
        part?.type !== 'image' ||
        typeof attachmentId !== 'string' ||
        !ATTACHMENT_ID.test(attachmentId) ||
        seen.has(attachmentId)
      ) {
        continue;
      }
      seen.add(attachmentId);
      ids.push(attachmentId);
    }
    return ids;
  }

  private assertObjectType(
    stream: { destroy?: () => void },
    objectContentType: string | undefined,
    contentType: string,
  ) {
    const objectType = this.shareableImageType(objectContentType);
    if (
      !this.isGenericBinary(objectContentType) &&
      objectType !== contentType
    ) {
      stream.destroy?.();
      throw this.notFound();
    }
  }

  private shareableImageType(contentType?: string | null) {
    const normalized = contentType?.split(';', 1)[0]?.trim().toLowerCase();
    return normalized && SHAREABLE_IMAGE_TYPES.has(normalized)
      ? normalized
      : null;
  }

  private isGenericBinary(contentType?: string | null) {
    const normalized = contentType?.split(';', 1)[0]?.trim().toLowerCase();
    return (
      !normalized ||
      normalized === 'application/octet-stream' ||
      normalized === 'binary/octet-stream'
    );
  }

  private writeInlineImage(
    response: Response,
    stream: { pipe: (destination: Response) => unknown },
    contentType: string,
  ) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Content-Type', contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    stream.pipe(response);
  }

  private notFound() {
    return new AppException(
      'Conversation share not found.',
      'CONVERSATION_SHARE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  }
}
