import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  HeadObjectCommand,
  HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import generateId from 'omniboxd/utils/generate-id';
import { getOriginalFileName } from 'omniboxd/utils/encode-filename';

export class ObjectMeta {
  constructor(
    public contentType?: string,
    public contentLength?: number,
    public metadata?: Record<string, string>,
    public lastModified?: Date,
  ) {}

  static fromResponse(
    response: GetObjectCommandOutput | HeadObjectCommandOutput,
  ): ObjectMeta {
    return new ObjectMeta(
      response.ContentType,
      response.ContentLength,
      response.Metadata,
      response.LastModified,
    );
  }
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

  private generateId(filename?: string, length: number = 32): string {
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

  // There might still be race conditions but the probability should be low enough
  async generateObjectKey(
    prefix: string,
    filename?: string,
    length: number = 32,
  ): Promise<{ objectKey: string; objectName: string }> {
    if (!prefix.endsWith('/')) {
      prefix += '/';
    }
    for (let i = 0; i < 5; i++) {
      const objectName = this.generateId(filename, length);
      const objectKey = `${prefix}${objectName}`;
      if ((await this.headObject(objectKey)) === null) {
        return { objectKey, objectName };
      }
    }
    throw new Error('Unable to generate unique S3 key');
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

  async getObject(
    key: string,
  ): Promise<{ stream: Readable; meta: ObjectMeta }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.s3Client.send(command);
    return {
      stream: response.Body as Readable,
      meta: ObjectMeta.fromResponse(response),
    };
  }

  async headObject(key: string): Promise<ObjectMeta | null> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const response = await this.s3Client.send(command);
      return ObjectMeta.fromResponse(response);
    } catch (error: any) {
      if (
        error?.name === 'NotFound' ||
        error?.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return await this.s3Client.send(command);
  }
}
