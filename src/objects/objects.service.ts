import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Credentials, STS } from 'ali-oss';
import * as OSS from 'ali-oss';
import { UploadSessionDto } from './dto/upload-session.dto';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

@Injectable()
export class ObjectsService {
  private readonly sts?: STS;
  private readonly oss?: OSS;
  private readonly arn?: string;
  private readonly bucket?: string;

  constructor(configService: ConfigService) {
    const accessKeyId = configService.get('OBB_ALIYUN_ACCESS_KEY_ID');
    const accessKeySecret = configService.get('OBB_ALIYUN_ACCESS_KEY_SECRET');
    const region = configService.get('OBB_ALIYUN_OSS_REGION');
    const arn = configService.get('OBB_ALIYUN_OSS_ARN');
    const bucket = configService.get('OBB_ALIYUN_OSS_BUCKET');
    if (!accessKeyId || !accessKeySecret || !region || !arn || !bucket) {
      return;
    }
    this.sts = new STS({
      accessKeyId,
      accessKeySecret,
    });
    this.oss = new OSS({
      region,
      accessKeyId,
      accessKeySecret,
      bucket,
    });
    this.arn = arn;
    this.bucket = bucket;
  }

  private async createUploadCredentials(path: string): Promise<Credentials> {
    if (!this.bucket || !this.sts || !this.arn) {
      throw Error('Not configured');
    }
    const policy = {
      Version: '1',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'oss:PutObject',
          Resource: [`acs:oss:*:*:${this.bucket}/${path}`],
        },
      ],
    };
    return (await this.sts.assumeRole(this.arn, policy, 3600)).credentials;
  }

  async createUploadSession(): Promise<UploadSessionDto> {
    if (!this.bucket) {
      throw Error('Not configured');
    }
    const path = `uploads/${randomUUID()}`;
    const credentials = await this.createUploadCredentials(path);
    const uploadInfo: UploadSessionDto = {
      accessKeyId: credentials.AccessKeyId,
      accessKeySecret: credentials.AccessKeySecret,
      securityToken: credentials.SecurityToken,
      bucket: this.bucket,
      path,
    };
    return uploadInfo;
  }

  async getObject(path: string): Promise<Readable> {
    if (!this.oss) {
      throw Error('Not configured');
    }
    const stream = await this.oss.getStream(path);
    return stream.stream;
  }
}
