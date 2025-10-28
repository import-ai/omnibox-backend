import { Injectable } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import { ConfigService } from '@nestjs/config';
import { FileInfoDto } from './dtos/file-info.dto';
import { Repository } from 'typeorm';
import { File } from './entities/file.entity';

@Injectable()
export class FilesService {
  private readonly awsClient: AwsClient;
  private readonly s3Url: URL;

  constructor(
    configService: ConfigService,
    private readonly fileRepo: Repository<File>,
  ) {
    const accessKeyId = configService.get<string>('OBB_S3_ACCESS_KEY_ID');
    const secretAccessKey = configService.get<string>(
      'OBB_S3_SECRET_ACCESS_KEY',
    );
    const s3Url = configService.get<string>('OBB_S3_URL');
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not set');
    }
    if (!s3Url) {
      throw new Error('S3 URL not set');
    }
    this.awsClient = new AwsClient({ accessKeyId, secretAccessKey });
    this.s3Url = new URL(s3Url);
  }

  async createFile(userId: string, namespaceId: string): Promise<FileInfoDto> {
    const file = await this.fileRepo.save(
      this.fileRepo.create({ namespaceId, userId }),
    );
    const fileUrl = new URL(file.id, this.s3Url);
    const signedReq = await this.awsClient.sign(fileUrl.toString(), {
      method: 'PUT',
      headers: {
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        'x-amz-expires': '900', // 900 seconds
      },
    });
    return FileInfoDto.new(file.id, fileUrl.toString(), signedReq.headers);
  }

  async generateDownloadUrl(fileId: string) {
    // todo
  }
}
