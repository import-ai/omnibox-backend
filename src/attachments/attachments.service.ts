import encodeFileName from 'omnibox-backend/utils/encode-filename';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { MinioService } from 'omnibox-backend/resources/minio/minio.service';
import { PermissionsService } from 'omnibox-backend/permissions/permissions.service';
import { ResourcePermission } from 'omnibox-backend/permissions/resource-permission.enum';
import { objectStreamResponse } from 'omnibox-backend/resources/utils';

@Injectable()
export class AttachmentsService {
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

  async checkAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
  ) {
    const info = await this.minioService.info(attachmentId);
    if (
      info.metadata.namespaceId === namespaceId ||
      info.metadata.resourceId === resourceId
    ) {
      return info;
    }
    throw new NotFoundException(attachmentId);
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
        const { id } = await this.minioService.put(
          filename,
          file.buffer,
          file.mimetype,
          {
            metadata: { namespaceId, resourceId, userId },
          },
        );
        uploaded.push({
          name: filename,
          link: id,
        });
      } catch (e) {
        console.error(e);
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
    const stream = await this.minioService.getObject(attachmentId);
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
    await this.minioService.removeObject(attachmentId);
    return { id: attachmentId, success: true };
  }

  async displayImage(
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
      ResourcePermission.CAN_EDIT,
    );
    await this.checkAttachment(namespaceId, resourceId, attachmentId);
    const objectResponse = await this.minioService.get(attachmentId);
    if (objectResponse.mimetype.startsWith('image/')) {
      return objectStreamResponse(objectResponse, httpResponse);
    }
    throw new BadRequestException(attachmentId);
  }
}
