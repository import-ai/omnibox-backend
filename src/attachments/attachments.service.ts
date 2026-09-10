import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
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

import {
  AttachmentLlmUrlResponseDto,
  AttachmentResponseDto,
  ListAttachmentsResponseDto,
} from './dto/attachment-response.dto';
import {
  UploadAttachmentsResponseDto,
  UploadedAttachmentDto,
} from './dto/upload-attachments-response.dto';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly permissionsService: PermissionsService,
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
    private readonly sharedResourcesService: SharedResourcesService,
  ) {}

  private async signObjectUrlForLlm(objectKey: string): Promise<string | null> {
    if (!this.s3Service.hasDistinctPublicEndpoint()) return null;
    return this.s3Service.generateDownloadUrl(objectKey, true);
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
