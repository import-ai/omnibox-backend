import { HttpStatus } from '@nestjs/common';
import { S3Service } from 'omniboxd/s3/s3.service';

import {
  NotificationAssetsService,
  SYSTEM_NOTIFICATION_ASSET_MAX_SIZE,
} from './notification-assets.service';

describe('NotificationAssetsService', () => {
  const generateObjectKey = jest.fn();
  const putObject = jest.fn();
  const s3Service = {
    generateObjectKey,
    putObject,
  } as unknown as S3Service;
  const service = new NotificationAssetsService(s3Service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads an image and returns a stable application URL', async () => {
    generateObjectKey.mockResolvedValue({
      objectKey: 'system-notification-assets/random-image.png',
      objectName: 'random-image.png',
    });
    putObject.mockResolvedValue(undefined);
    const buffer = Buffer.from('image');

    await expect(
      service.upload({
        buffer,
        mimetype: 'image/png',
        originalname: 'screenshot.png',
        size: buffer.length,
      } as Express.Multer.File),
    ).resolves.toEqual({
      url: '/api/v1/notification-assets/random-image.png',
    });
    expect(putObject).toHaveBeenCalledWith(
      'system-notification-assets/random-image.png',
      buffer,
      'image/png',
    );
  });

  it('rejects unsupported image types', async () => {
    await expect(
      service.upload({
        buffer: Buffer.from('<svg/>'),
        mimetype: 'image/svg+xml',
        originalname: 'image.svg',
        size: 6,
      } as Express.Multer.File),
    ).rejects.toMatchObject({
      code: 'FILE_TYPE_NOT_SUPPORTED',
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects images larger than 10 MB', async () => {
    await expect(
      service.upload({
        buffer: Buffer.alloc(0),
        mimetype: 'image/png',
        originalname: 'image.png',
        size: SYSTEM_NOTIFICATION_ASSET_MAX_SIZE + 1,
      } as Express.Multer.File),
    ).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      status: HttpStatus.BAD_REQUEST,
    });
  });
});
