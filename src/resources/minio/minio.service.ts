import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService {
  private readonly minioClient: Minio.Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    // Parse MINIO_URL from config
    const minioEndpoint =
      this.configService.get<string>('OBB_MINIO_ENDPOINT') ||
      'http://username:password@minio:9000';
    const url = new URL(minioEndpoint);
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

    this.bucket =
      this.configService.get<string>('OBB_MINIO_BUCKET') || 'default';

    this.minioClient
      .bucketExists(this.bucket)
      .then((exists) => {
        if (!exists) {
          return this.minioClient.makeBucket(this.bucket, 'us-east-1');
        }
      })
      .catch((err) => {
        console.error('Error ensuring bucket exists:', err);
        throw err;
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
}
