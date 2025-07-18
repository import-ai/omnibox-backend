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
export class ResourceAttachmentsService {
  constructor(
    private readonly minioService: MinioService,
    private readonly permissionsService: PermissionsService,
  ) {}

  getKey(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
  ): string {
    return `${namespaceId}/${resourceId}/${attachmentId}`;
  }

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
        const uuid: string = generateId(16);
        const ext: string = originalName.substring(
          originalName.lastIndexOf('.'),
          originalName.length,
        );
        const filename: string = `${uuid}${ext}`;
        await this.minioService.put(originalName, file.buffer, file.mimetype, {
          metadata: { namespaceId, resourceId, userId },
          savePath: this.getKey(namespaceId, resourceId, filename),
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
    const objectResponse = await this.minioService.get(
      this.getKey(namespaceId, resourceId, attachmentId),
    );
    return objectStreamResponse(objectResponse, httpResponse);
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
    await this.minioService.removeObject(
      this.getKey(namespaceId, resourceId, attachmentId),
    );
    return { success: true };
  }

  async displayImage(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    httpResponse: Response,
  ) {
    try {
      const objectResponse = await this.minioService.get(
        this.getKey(namespaceId, resourceId, attachmentId),
      );
      if (objectResponse.mimetype.startsWith('image/')) {
        return objectStreamResponse(objectResponse, httpResponse);
      }
    } catch (error) {
      if (error.code !== 'NotFound') {
        console.error({ error });
      }
    }
    throw new NotFoundException();
  }
}
