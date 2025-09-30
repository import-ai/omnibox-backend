import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Credentials, STS } from 'ali-oss';
import { UploadInfoDto } from './dto/upload-info.dto';

@Injectable()
export class UploadsService {
  private readonly sts: STS | undefined;
  private readonly arn: string | undefined;
  private readonly bucket: string | undefined;

  constructor(configService: ConfigService) {
    const accessKeyId = configService.get('OBB_ALIYUN_ACCESS_KEY_ID');
    const accessKeySecret = configService.get('OBB_ALIYUN_ACCESS_KEY_SECRET');
    this.arn = configService.get('OBB_ALIYUN_OSS_ARN');
    this.bucket = configService.get('OBB_ALIYUN_OSS_BUCKET');
    if (accessKeyId && accessKeySecret) {
      this.sts = new STS({
        accessKeyId,
        accessKeySecret,
      });
    }
  }

  private async getCredentials(): Promise<Credentials> {
    if (!this.sts || !this.arn || !this.bucket) {
      throw new Error('Not configured');
    }
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
    if (!this.sts || !this.arn || !this.bucket) {
      throw new Error('Not configured');
    }
    const credentials = await this.getCredentials();
    const uploadInfo: UploadInfoDto = {
      accessKeyId: credentials.AccessKeyId,
      accessKeySecret: credentials.AccessKeySecret,
      securityToken: credentials.SecurityToken,
      bucket: this.bucket,
      directory: 'uploads',
    };
    return uploadInfo;
  }
}
