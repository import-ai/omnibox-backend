import {
  encodeFileName,
  getOriginalFileName,
} from 'omniboxd/utils/encode-filename';
import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { Response } from 'express';
import { S3Service } from 'omniboxd/s3/s3.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { objectStreamResponse } from 'omniboxd/s3/utils';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import {
  UploadAttachmentsResponseDto,
  UploadedAttachmentDto,
} from './dto/upload-attachments-response.dto';
import { SharesService } from 'omniboxd/shares/shares.service';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { Share } from 'omniboxd/shares/entities/share.entity';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly permissionsService: PermissionsService,
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
    private readonly sharesService: SharesService,
    private readonly sharedResourcesService: SharedResourcesService,
    private readonly i18n: I18nService,
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
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
  }

  s3Path(attachmentId: string): string {
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

    const id = await this.s3Service.put(filename, buffer, mimetype, {
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

    const objectResponse = await this.s3Service.get(
      this.s3Path(attachmentId),
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

    const objectResponse = await this.s3Service.get(
      this.s3Path(attachmentId),
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
