import { HttpStatus, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { S3Service } from 'omniboxd/s3/s3.service';

const SYSTEM_NOTIFICATION_ASSET_PREFIX = 'system-notification-assets';
const SYSTEM_NOTIFICATION_ASSET_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export const SYSTEM_NOTIFICATION_ASSET_MAX_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class NotificationAssetsService {
  constructor(private readonly s3Service: S3Service) {}

  async upload(file?: Express.Multer.File): Promise<{ url: string }> {
    if (!file) {
      throw new AppException(
        'Image file is required',
        'FILE_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (file.size > SYSTEM_NOTIFICATION_ASSET_MAX_SIZE) {
      throw new AppException(
        'Image file must not exceed 10 MB',
        'FILE_TOO_LARGE',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new AppException(
        'Only PNG, JPEG, WebP, and GIF images are supported',
        'FILE_TYPE_NOT_SUPPORTED',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { objectKey, objectName } = await this.s3Service.generateObjectKey(
      SYSTEM_NOTIFICATION_ASSET_PREFIX,
      file.originalname,
    );
    await this.s3Service.putObject(objectKey, file.buffer, file.mimetype);

    return {
      url: `/api/v1/notification-assets/${encodeURIComponent(objectName)}`,
    };
  }

  async pipeToResponse(assetName: string, response: Response): Promise<void> {
    if (!SYSTEM_NOTIFICATION_ASSET_NAME_PATTERN.test(assetName)) {
      throw this.assetNotFound();
    }

    const objectKey = `${SYSTEM_NOTIFICATION_ASSET_PREFIX}/${assetName}`;
    const objectMeta = await this.s3Service.headObject(objectKey);
    if (!objectMeta) {
      throw this.assetNotFound();
    }

    const { stream, meta } = await this.s3Service.getObject(objectKey);
    response.setHeader(
      'Content-Type',
      meta.contentType || 'application/octet-stream',
    );
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (meta.contentLength !== undefined) {
      response.setHeader('Content-Length', meta.contentLength.toString());
    }
    if (meta.lastModified) {
      response.setHeader('Last-Modified', meta.lastModified.toUTCString());
    }
    stream.pipe(response);
  }

  private assetNotFound(): AppException {
    return new AppException(
      'Notification image not found',
      'FILE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  }
}
