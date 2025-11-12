import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { File } from './entities/file.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost, PresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { formatFileSize } from '../utils/format-file-size';

@Injectable()
export class FilesService {
  private readonly s3Client: S3Client;
  private readonly s3InternalClient: S3Client;
  private readonly s3Bucket: string;
  private readonly s3Prefix: string;
  private readonly s3MaxFileSize: number;

  constructor(
    configService: ConfigService,

    @InjectRepository(File)
    private readonly fileRepo: Repository<File>,
    private readonly i18n: I18nService,
  ) {
    const accessKeyId = configService.get<string>('OBB_S3_ACCESS_KEY_ID');
    const secretAccessKey = configService.get<string>(
      'OBB_S3_SECRET_ACCESS_KEY',
    );
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('S3 credentials not set');
    }

    const s3Endpoint = configService.get<string>('OBB_S3_ENDPOINT');
    if (!s3Endpoint) {
      throw new Error('S3 endpoint not set');
    }

    const s3InternalEndpoint = configService.get<string>(
      'OBB_S3_INTERNAL_ENDPOINT',
    );

    const s3Bucket = configService.get<string>('OBB_S3_BUCKET');
    if (!s3Bucket) {
      throw new Error('S3 bucket not set');
    }

    const s3Prefix = configService.get<string>('OBB_S3_PREFIX');
    if (!s3Prefix) {
      throw new Error('S3 prefix not set');
    }

    const s3Region = configService.get<string>('OBB_S3_REGION', 'us-east-1');

    this.s3MaxFileSize = configService.get<number>(
      'OBB_S3_MAX_FILE_SIZE',
      20 * 1024 * 1024,
    );

    this.s3Client = new S3Client({
      region: s3Region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      endpoint: s3Endpoint,
    });

    if (s3InternalEndpoint && s3InternalEndpoint != s3Endpoint) {
      this.s3InternalClient = new S3Client({
        region: s3Region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        endpoint: s3InternalEndpoint,
      });
    } else {
      this.s3InternalClient = this.s3Client;
    }

    this.s3Bucket = s3Bucket;
    this.s3Prefix = s3Prefix;
  }

  async createFile(
    userId: string,
    namespaceId: string,
    filename: string,
    mimetype: string,
  ): Promise<File> {
    return await this.fileRepo.save(
      this.fileRepo.create({
        namespaceId,
        userId,
        name: filename,
        mimetype,
      }),
    );
  }

  async getFile(namespaceId: string, fileId: string): Promise<File | null> {
    return await this.fileRepo.findOne({ where: { namespaceId, id: fileId } });
  }

  async generateUploadForm(
    fileId: string,
    fileSize: number | undefined,
    filename: string,
    mimetype: string,
  ): Promise<PresignedPost> {
    if (fileSize && fileSize > this.s3MaxFileSize) {
      const message = this.i18n.t('resource.errors.fileTooLarge', {
        args: {
          userSize: formatFileSize(fileSize),
          limitSize: formatFileSize(this.s3MaxFileSize),
        },
      });
      throw new AppException(message, 'FILE_TOO_LARGE', HttpStatus.BAD_REQUEST);
    }
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
    return await createPresignedPost(this.s3Client, {
      Bucket: this.s3Bucket,
      Key: `${this.s3Prefix}/${fileId}`,
      Conditions: [
        ['content-length-range', 0, this.s3MaxFileSize],
        { 'content-type': mimetype },
        { 'content-disposition': disposition },
      ],
      Fields: {
        'content-type': mimetype,
        'content-disposition': disposition,
      },
      Expires: 900, // 900 seconds
    });
  }

  private async generateDownloadUrl(
    namespaceId: string,
    fileId: string,
    s3Client: S3Client,
  ): Promise<string> {
    const file = await this.getFile(namespaceId, fileId);
    if (!file) {
      const message = this.i18n.t('resource.errors.fileNotFound');
      throw new AppException(message, 'FILE_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const command = new GetObjectCommand({
      Bucket: this.s3Bucket,
      Key: `${this.s3Prefix}/${fileId}`,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    });

    return await getSignedUrl(s3Client, command, { expiresIn: 900 });
  }

  async generatePublicDownloadUrl(
    namespaceId: string,
    fileId: string,
  ): Promise<string> {
    return this.generateDownloadUrl(namespaceId, fileId, this.s3Client);
  }

  async generateInternalDownloadUrl(
    namespaceId: string,
    fileId: string,
  ): Promise<string> {
    return this.generateDownloadUrl(namespaceId, fileId, this.s3InternalClient);
  }
}
