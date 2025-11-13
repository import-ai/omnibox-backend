import {
  encodeFileName,
  getOriginalFileName,
} from 'omniboxd/utils/encode-filename';
import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ObjectMeta, S3Service } from 'omniboxd/s3/s3.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import {
  UploadAttachmentsResponseDto,
  UploadedAttachmentDto,
} from './dto/upload-attachments-response.dto';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { Readable } from 'stream';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly permissionsService: PermissionsService,
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
    private readonly sharedResourcesService: SharedResourcesService,
  ) {}

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

    const { key, objectName } = await this.s3Service.generateObjectKey(
      'attachments',
      filename,
    );
    const metadata = {
      filename: encodeFileName(filename),
    };
    await this.s3Service.putObject(key, buffer, mimetype, metadata);

    // Create the resource-attachment relation
    await this.resourceAttachmentsService.addAttachmentToResource(
      namespaceId,
      resourceId,
      objectName,
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
