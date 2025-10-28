import { Injectable } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import { ConfigService } from '@nestjs/config';
import { FileInfoDto } from './dtos/file-info.dto';
import { Repository } from 'typeorm';
import { File } from './entities/file.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class FilesService {
  private readonly awsClient: AwsClient;
  private readonly s3Url: URL;

  constructor(
    configService: ConfigService,

    @InjectRepository(File)
    private readonly fileRepo: Repository<File>,
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

  async getFile(namespaceId: string, fileId: string): Promise<File | null> {
    return await this.fileRepo.findOne({ where: { namespaceId, id: fileId } });
  }

  async generateDownloadUrl(fileId: string) {
    // todo
  }
}
