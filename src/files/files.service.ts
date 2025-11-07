import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { File } from './entities/file.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost, PresignedPost } from '@aws-sdk/s3-presigned-post';
import { AwsClient } from 'aws4fetch';

@Injectable()
export class FilesService {
  private readonly awsClient: AwsClient;
  private readonly s3Url: URL;
  private readonly s3InternalUrl: URL;
  private readonly s3Client: S3Client;
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

    let s3Url = configService.get<string>('OBB_S3_URL');
    if (!s3Url) {
      throw new Error('S3 URL not set');
    }
    if (!s3Url.endsWith('/')) {
      s3Url += '/';
    }

    let s3InternalUrl = configService.get<string>('OBB_S3_INTERNAL_URL');
    if (!s3InternalUrl) {
      s3InternalUrl = s3Url;
    } else if (!s3InternalUrl.endsWith('/')) {
      s3InternalUrl += '/';
    }

    const s3Endpoint = configService.get<string>('OBB_S3_ENDPOINT');
    if (!s3Endpoint) {
      throw new Error('S3 endpoint not set');
    }

    const s3Bucket = configService.get<string>('OBB_S3_BUCKET');
    if (!s3Bucket) {
      throw new Error('S3 bucket not set');
    }

    const s3Prefix = configService.get<string>('OBB_S3_PREFIX');
    if (!s3Prefix) {
      throw new Error('S3 prefix not set');
    }

    this.awsClient = new AwsClient({ accessKeyId, secretAccessKey });
    this.s3Url = new URL(s3Url);
    this.s3InternalUrl = new URL(s3InternalUrl);
    this.s3MaxFileSize = configService.get<number>(
      'OBB_S3_MAX_FILE_SIZE',
      20 * 1024 * 1024,
    );
    this.s3Client = new S3Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      endpoint: s3Endpoint,
    });
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

  async generateUploadUrl(fileId: string): Promise<string> {
    const fileUrl = new URL(fileId, this.s3Url);
    fileUrl.searchParams.set('X-Amz-Expires', '900'); // 900 seconds
    const signedReq = await this.awsClient.sign(fileUrl.toString(), {
      method: 'PUT',
      aws: {
        service: 's3',
        signQuery: true,
      },
    });
    return signedReq.url;
  }

  async generatePostForm(
    fileId: string,
    fileSize: number,
    filename: string,
    mimetype: string,
  ): Promise<PresignedPost> {
    if (fileSize > this.s3MaxFileSize) {
      const message = this.i18n.t('resource.errors.fileTooLarge');
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
    s3Url: URL,
  ): Promise<string> {
    const file = await this.getFile(namespaceId, fileId);
    if (!file) {
      const message = this.i18n.t('resource.errors.fileNotFound');
      throw new AppException(message, 'FILE_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const fileUrl = new URL(fileId, s3Url);
    fileUrl.searchParams.set('X-Amz-Expires', '900'); // 900 seconds
    fileUrl.searchParams.set(
      'response-content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );

    const signedReq = await this.awsClient.sign(fileUrl.toString(), {
      method: 'GET',
      aws: {
        service: 's3',
        signQuery: true,
      },
    });
    return signedReq.url;
  }

  async generatePublicDownloadUrl(
    namespaceId: string,
    fileId: string,
  ): Promise<string> {
    return this.generateDownloadUrl(namespaceId, fileId, this.s3Url);
  }

  async generateInternalDownloadUrl(
    namespaceId: string,
    fileId: string,
  ): Promise<string> {
    return this.generateDownloadUrl(namespaceId, fileId, this.s3InternalUrl);
  }
}
