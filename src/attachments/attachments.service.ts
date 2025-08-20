import {
  encodeFileName,
  getOriginalFileName,
} from 'omniboxd/utils/encode-filename';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { MinioService } from 'omniboxd/minio/minio.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { objectStreamResponse } from 'omniboxd/minio/utils';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import {
  UploadAttachmentsResponseDto,
  UploadedAttachmentDto,
} from './dto/upload-attachments-response.dto';
import { SharesService } from 'omniboxd/shares/shares.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly minioService: MinioService,
    private readonly permissionsService: PermissionsService,
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
    private readonly sharesService: SharesService,
    private readonly resourcesService: ResourcesService,
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
      folder: 'attachments',
    });

    // Create the resource-attachment relation
    await this.resourceAttachmentsService.addAttachmentToResource(
      namespaceId,
      resourceId,
      id,
    );

    return id;
  }

  async uploadAttachments(
    namespaceId: string,
    resourceId: string,
    userId: string,
    files: Express.Multer.File[],
  ): Promise<UploadAttachmentsResponseDto> {
    await this.checkPermission(
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
    await this.checkPermission(
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

    const objectResponse = await this.minioService.get(
      this.minioPath(attachmentId),
    );

    // Display media files inline, download other files as attachments
    const forceDownload = !this.isMedia(objectResponse.mimetype);

    return objectStreamResponse(objectResponse, httpResponse, {
      forceDownload,
    });
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
    shareId: string,
    resourceId: string,
    attachmentId: string,
    password: string,
    userId: string | undefined,
    httpResponse: Response,
  ) {
    const share = await this.sharesService.getShareById(shareId);
    if (!share || !share.enabled) {
      throw new NotFoundException(`No share found with id ${shareId}`);
    }

    // Check if share has expired
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException(`No share found with id ${shareId}`);
    }

    if (share.requireLogin && !userId) {
      throw new UnauthorizedException('This share requires login');
    }

    if (share.password) {
      if (!password) {
        throw new ForbiddenException(`Invalid password for share ${shareId}`);
      }
      const match = await bcrypt.compare(password, share.password);
      if (!match) {
        throw new ForbiddenException(`Invalid password for share ${shareId}`);
      }
    }

    const resource = await this.resourcesService.get(resourceId);
    if (!resource || resource.namespaceId != share.namespaceId) {
      throw new NotFoundException(`No resource found with id ${resourceId}`);
    }

    if (resource.id !== share.resourceId) {
      const parents = await this.resourcesService.getParentResources(
        share.namespaceId,
        resource.parentId,
      );
      if (!parents.map((r) => r.id).includes(share.resourceId)) {
        throw new NotFoundException(`No resource found with id ${resourceId}`);
      }
    }

    await this.resourceAttachmentsService.getResourceAttachmentOrFail(
      share.namespaceId,
      resourceId,
      attachmentId,
    );

    const objectResponse = await this.minioService.get(
      this.minioPath(attachmentId),
    );

    // Display media files inline, download other files as attachments
    const forceDownload = !this.isMedia(objectResponse.mimetype);

    return objectStreamResponse(objectResponse, httpResponse, {
      forceDownload,
    });
  }

  isMedia(mimetype: string): boolean {
    for (const type of ['image/', 'audio/']) {
      if (mimetype.startsWith(type)) {
        return true;
      }
    }
    return false;
  }
}
