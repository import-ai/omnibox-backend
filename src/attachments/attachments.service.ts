import encodeFileName from 'omniboxd/utils/encode-filename';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { MinioService } from 'omniboxd/minio/minio.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { objectStreamResponse } from 'omniboxd/minio/utils';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly minioService: MinioService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async checkPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
    permission: ResourcePermission = ResourcePermission.CAN_VIEW,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      permission,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
  }

  minioPath(attachmentId: string): string {
    return `attachments/${attachmentId}`;
  }

  async checkAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
  ) {
    const info = await this.minioService.info(this.minioPath(attachmentId));
    if (
      info.metadata.namespaceId === namespaceId ||
      info.metadata.resourceId === resourceId
    ) {
      return info;
    }
    throw new NotFoundException(attachmentId);
  }

  async uploadAttachment(
    namespaceId: string,
    resourceId: string,
    userId: string,
    filename: string,
    buffer: Buffer,
    mimetype: string,
  ) {
    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    const { id } = await this.minioService.put(filename, buffer, mimetype, {
      metadata: { namespaceId, resourceId, userId },
      folder: 'attachments',
    });
    return id;
  }

  async uploadAttachments(
    namespaceId: string,
    resourceId: string,
    userId: string,
    files: Express.Multer.File[],
  ) {
    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    const failed: string[] = [];
    const uploaded: Record<string, string>[] = [];

    for (const file of files) {
      try {
        const filename: string = encodeFileName(file.originalname);
        file.originalname = filename;
        const id = await this.uploadAttachment(
          namespaceId,
          resourceId,
          userId,
          filename,
          file.buffer,
          file.mimetype,
        );
        uploaded.push({
          name: filename,
          link: id,
        });
      } catch (error) {
        this.logger.error({ error });
        failed.push(file.originalname);
      }
    }

    return { uploaded, failed };
  }

  async downloadAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
    httpResponse: Response,
  ) {
    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );
    const info = await this.checkAttachment(
      namespaceId,
      resourceId,
      attachmentId,
    );
    const stream = await this.minioService.getObject(
      this.minioPath(attachmentId),
    );
    return objectStreamResponse({ stream, ...info }, httpResponse);
  }

  async deleteAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    await this.checkAttachment(namespaceId, resourceId, attachmentId);
    await this.minioService.removeObject(this.minioPath(attachmentId));
    return { id: attachmentId, success: true };
  }

  async displayImage(
    attachmentId: string,
    userId: string,
    httpResponse: Response,
  ) {
    const objectResponse = await this.minioService.get(
      this.minioPath(attachmentId),
    );
    const { namespaceId, resourceId } = objectResponse.metadata;

    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );
    await this.checkAttachment(namespaceId, resourceId, attachmentId);
    if (objectResponse.mimetype.startsWith('image/')) {
      return objectStreamResponse(objectResponse, httpResponse);
    }
    throw new BadRequestException(attachmentId);
  }
}
