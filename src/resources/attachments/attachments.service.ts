import encodeFileName from 'src/utils/encode-filename';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { MinioService } from 'src/resources/minio/minio.service';
import { PermissionsService } from 'src/permissions/permissions.service';
import generateId from 'src/utils/generate-id';
import { ResourcePermission } from 'src/permissions/resource-permission.enum';
import { objectStreamResponse } from 'src/resources/utils';

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
        const originalName: string = encodeFileName(file.originalname);
        file.originalname = originalName;
        const uuid: string = generateId(32);
        const ext: string = originalName.substring(
          originalName.lastIndexOf('.'),
          originalName.length,
        );
        const filename: string = `${uuid}${ext}`;
        await this.minioService.put(originalName, file.buffer, file.mimetype, {
          metadata: { namespaceId, resourceId, userId },
          id: filename,
        });
        uploaded.push({
          name: originalName,
          link: filename,
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

  async displayImage(attachmentId: string, httpResponse: Response) {
    try {
      const objectResponse = await this.minioService.get(attachmentId);
      if (objectResponse.mimetype.startsWith('image/')) {
        return objectStreamResponse(objectResponse, httpResponse);
      }
    } catch (error) {
      if (error.code !== 'NotFound') {
        console.error({ error });
      }
    }
    throw new NotFoundException(attachmentId);
  }
}
