import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';
import generateId from 'omniboxd/utils/generate-id';
import {
  decodeFileName,
  encodeFileName,
  getOriginalFileName,
} from 'omniboxd/utils/encode-filename';
import { UploadedObjectInfo } from 'minio/dist/main/internal/type';

export interface PutOptions {
  id?: string;
  metadata?: Record<string, any>; // camel
  bucket?: string;
  folder?: string;
}

export interface PutResponse extends UploadedObjectInfo {
  id: string;
}

export interface ObjectInfo {
  filename: string;
  mimetype: string;
  metadata: Record<string, any>;
  stat: Minio.BucketItemStat;
}

export interface GetResponse extends ObjectInfo {
  stream: Readable;
}

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private readonly minioClient: Minio.Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    // Parse MINIO_URL from config
    const minioUrl =
      this.configService.get<string>('OBB_MINIO_URL') ||
      'http://username:password@minio:9000/omnibox';
    const url = new URL(minioUrl);
    const accessKey = url.username;
    const secretKey = url.password;
    const endPoint = url.hostname;
    const port = url.port
      ? parseInt(url.port, 10)
      : url.protocol === 'https:'
        ? 443
        : 80;
    const useSSL = url.protocol === 'https:';

    this.minioClient = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    this.bucket = url.pathname.split('/')[1];

    this.minioClient
      .bucketExists(this.bucket)
      .then((exists) => {
        if (!exists) {
          return this.minioClient.makeBucket(this.bucket, 'us-east-1');
        }
      })
      .catch((error) => {
        this.logger.error({ error });
        throw error;
      });
  }

  async putObject(
    objectName: string,
    buffer: Buffer,
    mimetype: string,
    bucket: string = this.bucket,
  ) {
    return await this.minioClient.putObject(
      bucket,
      objectName,
      buffer,
      buffer.length,
      {
        'Content-Type': mimetype,
      },
    );
  }

  async putChunkObject(
    objectName: string,
    chunk: Buffer,
    size: number,
    bucket: string = this.bucket,
  ) {
    return await this.minioClient.putObject(bucket, objectName, chunk, size);
  }

  async composeObject(
    objectName: string,
    chunksName: Array<string>,
    bucket: string = this.bucket,
  ) {
    const destOption = new Minio.CopyDestinationOptions({
      Bucket: bucket,
      Object: objectName,
      Headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
    const sourceList = chunksName.map(
      (name) =>
        new Minio.CopySourceOptions({
          Bucket: bucket,
          Object: name,
        }),
    );
    return this.minioClient.composeObject(destOption, sourceList);
  }

  async getObject(
    objectName: string,
    bucket: string = this.bucket,
  ): Promise<Readable> {
    return this.minioClient.getObject(bucket, objectName);
  }

  async getObjectUrl(
    objectName: string,
    bucket: string = this.bucket,
  ): Promise<string> {
    // Presigned URL, valid for 24h
    return this.minioClient.presignedGetObject(
      bucket,
      objectName,
      24 * 60 * 60,
    );
  }

  async removeObject(objectName: string, bucket: string = this.bucket) {
    return this.minioClient.removeObject(bucket, objectName);
  }

  async getStat(objectName: string, bucket: string = this.bucket) {
    return this.minioClient.statObject(bucket, objectName);
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
  ) {
    const {
      id = this.generateId(filename),
      metadata = {},
      bucket = this.bucket,
    } = options || {};
    const path: string = options?.folder ? `${options.folder}/${id}` : id;
    const info = await this.minioClient.putObject(
      bucket,
      path,
      buffer,
      buffer.length,
      {
        'Content-Type': mimetype,
        filename: encodeFileName(filename),
        // Minio would convert metadata keys to lowercase
        metadata_string: JSON.stringify(metadata),
      },
    );
    return { ...info, id } as PutResponse;
  }

  async info(objectName: string, bucket: string = this.bucket) {
    const stat = await this.getStat(objectName, bucket);
    const metadataString: string = stat?.metaData.metadata_string || '{}';
    const encodedFilename: string = stat?.metaData.filename;
    const filename: string = decodeFileName(encodedFilename);
    const mimetype: string =
      stat?.metaData['content-type'] || 'application/octet-stream';
    const metadata: Record<string, any> = JSON.parse(metadataString);
    return { filename, mimetype, metadata, stat } as ObjectInfo;
  }

  async get(objectName: string, bucket: string = this.bucket) {
    const [stream, info] = await Promise.all([
      this.getObject(objectName, bucket),
      this.info(objectName, bucket),
    ]);
    return { stream, ...info } as GetResponse;
  }
}
