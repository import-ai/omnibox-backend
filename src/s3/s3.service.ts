import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import generateId from 'omniboxd/utils/generate-id';
import {
  decodeFileName,
  encodeFileName,
  getOriginalFileName,
} from 'omniboxd/utils/encode-filename';

export interface PutOptions {
  id?: string;
  metadata?: Record<string, any>;
  folder?: string;
}

export interface ObjectInfo {
  filename: string;
  mimetype: string;
  metadata: Record<string, any>;
  stat: {
    size?: number;
    lastModified?: Date;
  };
}

export interface GetResponse extends ObjectInfo {
  stream: Readable;
}

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(configService: ConfigService) {
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

    const s3Bucket = configService.get<string>('OBB_S3_BUCKET');
    if (!s3Bucket) {
      throw new Error('S3 bucket not set');
    }

    const s3Region = configService.get<string>('OBB_S3_REGION', 'us-east-1');
    const forcePathStyle =
      configService.get<string>('OBB_S3_FORCE_PATH_STYLE', 'false') === 'true';

    this.s3Client = new S3Client({
      region: s3Region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      endpoint: s3Endpoint,
      forcePathStyle,
    });

    this.bucket = s3Bucket;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  private generateId(filename: string, length: number = 32): string {
    const uuid = generateId(length);
    // Get the original filename to extract the proper extension
    const originalFilename = getOriginalFileName(filename);
    const extIndex = originalFilename.lastIndexOf('.');
    if (extIndex === -1) {
      return uuid;
    }
    const ext: string = originalFilename.substring(
      extIndex,
      originalFilename.length,
    );
    return `${uuid}${ext}`;
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error: any) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        await this.s3Client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
      } else {
        throw error;
      }
    }
  }

  async putObject(
    key: string,
    buffer: Buffer,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
    });
    await this.s3Client.send(command);
  }

  async getObject(key: string): Promise<Readable> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.s3Client.send(command);
    return response.Body as Readable;
  }

  async deleteObject(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return await this.s3Client.send(command);
  }

  async put(
    filename: string,
    buffer: Buffer,
    mimetype: string,
    options?: PutOptions,
  ): Promise<string> {
    const { id = this.generateId(filename), metadata = {} } = options || {};
    const path: string = options?.folder ? `${options.folder}/${id}` : id;
    await this.putObject(path, buffer, mimetype, {
      filename: encodeFileName(filename),
      metadata: JSON.stringify(metadata),
    });
    return id;
  }

  async info(objectName: string): Promise<ObjectInfo> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: objectName,
    });
    const response = await this.s3Client.send(command);
    const metadataString: string =
      response.Metadata?.metadata_string || response.Metadata?.metadata || '{}';
    const encodedFilename: string = response.Metadata?.filename || '';
    const filename: string = decodeFileName(encodedFilename);
    const mimetype: string = response.ContentType || 'application/octet-stream';
    const metadata: Record<string, any> = JSON.parse(metadataString);
    const stat = {
      size: response.ContentLength,
      lastModified: response.LastModified,
    };
    return { filename, mimetype, metadata, stat };
  }

  async get(objectName: string): Promise<GetResponse> {
    const [stream, info] = await Promise.all([
      this.getObject(objectName),
      this.info(objectName),
    ]);
    return { stream, ...info } as GetResponse;
  }
}
