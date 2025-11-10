import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCopyCommand,
  CompleteMultipartUploadCommand,
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
export class MinioService {
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
    this.s3Client = new S3Client({
      region: s3Region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      endpoint: s3Endpoint,
    });

    this.bucket = s3Bucket;
  }

  async putObject(objectName: string, buffer: Buffer, mimetype: string) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectName,
      Body: buffer,
      ContentType: mimetype,
    });
    return await this.s3Client.send(command);
  }

  async putChunkObject(objectName: string, chunk: Buffer) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectName,
      Body: chunk,
    });
    return await this.s3Client.send(command);
  }

  async composeObject(objectName: string, chunksName: Array<string>) {
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: objectName,
      ContentType: 'application/octet-stream',
    });
    const { UploadId } = await this.s3Client.send(createCommand);
    if (!UploadId) {
      throw new Error('Failed to initiate multipart upload');
    }

    const uploadedParts: { ETag: string; PartNumber: number }[] = [];
    for (let i = 0; i < chunksName.length; i++) {
      const uploadPartCommand = new UploadPartCopyCommand({
        Bucket: this.bucket,
        Key: objectName,
        UploadId,
        PartNumber: i + 1,
        CopySource: `${this.bucket}/${chunksName[i]}`,
      });
      const response = await this.s3Client.send(uploadPartCommand);
      if (!response.CopyPartResult?.ETag) {
        throw new Error(`Failed to upload part`);
      }
      uploadedParts.push({
        ETag: response.CopyPartResult.ETag,
        PartNumber: i + 1,
      });
    }

    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: objectName,
      UploadId,
      MultipartUpload: {
        Parts: uploadedParts,
      },
    });
    return await this.s3Client.send(completeCommand);
  }

  async getObject(objectName: string): Promise<Readable> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectName,
    });
    const response = await this.s3Client.send(command);
    return response.Body as Readable;
  }

  async removeObject(objectName: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectName,
    });
    return await this.s3Client.send(command);
  }

  generateId(filename: string, length: number = 32): string {
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

  async put(
    filename: string,
    buffer: Buffer,
    mimetype: string,
    options?: PutOptions,
  ): Promise<string> {
    const { id = this.generateId(filename), metadata = {} } = options || {};
    const path: string = options?.folder ? `${options.folder}/${id}` : id;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      Body: buffer,
      ContentType: mimetype,
      Metadata: {
        filename: encodeFileName(filename),
        metadata: JSON.stringify(metadata),
      },
    });
    await this.s3Client.send(command);
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
