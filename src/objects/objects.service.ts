import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Credentials, STS } from 'ali-oss';
import * as OSS from 'ali-oss';
import { UploadInfoDto } from './dto/upload-info.dto';
import { Readable } from 'stream';

@Injectable()
export class ObjectsService {
  private readonly sts: STS;
  private readonly oss: OSS;
  private readonly arn: string;
  private readonly bucket: string;

  constructor(configService: ConfigService) {
    const accessKeyId = configService.get('OBB_ALIYUN_ACCESS_KEY_ID');
    const accessKeySecret = configService.get('OBB_ALIYUN_ACCESS_KEY_SECRET');
    const region = configService.get('OBB_ALIYUN_OSS_REGION');
    const arn = configService.get('OBB_ALIYUN_OSS_ARN');
    const bucket = configService.get('OBB_ALIYUN_OSS_BUCKET');
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

  private async getUploadCredentials(): Promise<Credentials> {
    const policy = {
      Version: '1',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'oss:PutObject',
          Resource: [`acs:oss:*:*:${this.bucket}/uploads/*`],
        },
      ],
    };
    return (await this.sts.assumeRole(this.arn, policy, 3600)).credentials;
  }

  async getUploadInfo(): Promise<UploadInfoDto> {
    const credentials = await this.getUploadCredentials();
    const uploadInfo: UploadInfoDto = {
      accessKeyId: credentials.AccessKeyId,
      accessKeySecret: credentials.AccessKeySecret,
      securityToken: credentials.SecurityToken,
      bucket: this.bucket,
      directory: 'uploads',
    };
    return uploadInfo;
  }

  async getObject(path: string): Promise<Readable> {
    const stream = await this.oss.getStream(path);
    return stream.stream;
  }
}
