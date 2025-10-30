import { HttpStatus, Injectable } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { File } from './entities/file.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class FilesService {
  private readonly awsClient: AwsClient;
  private readonly s3Url: URL;
  private readonly s3InternalUrl: URL;

  constructor(
    configService: ConfigService,

    @InjectRepository(File)
    private readonly fileRepo: Repository<File>,
    private readonly i18n: I18nService,
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

    let s3InternalUrl = configService.get<string>('OBB_S3_INTERNAL_URL');
    if (!s3InternalUrl) {
      s3InternalUrl = s3Url;
    } else if (!s3InternalUrl.endsWith('/')) {
      s3InternalUrl += '/';
    }

    this.awsClient = new AwsClient({ accessKeyId, secretAccessKey });
    this.s3Url = new URL(s3Url);
    this.s3InternalUrl = new URL(s3InternalUrl);
  }

  async createFile(
    userId: string,
    namespaceId: string,
    filename: string,
    mimetype: string,
  ): Promise<File> {
    return await this.fileRepo.save(
      this.fileRepo.create({
        namespaceId,
        userId,
        name: filename,
        mimetype,
      }),
    );
  }

  async getFile(namespaceId: string, fileId: string): Promise<File | null> {
    return await this.fileRepo.findOne({ where: { namespaceId, id: fileId } });
  }

  async generateUploadUrl(
    namespaceId: string,
    fileId: string,
  ): Promise<string> {
    const fileUrl = new URL(`${namespaceId}/${fileId}`, this.s3Url);
    fileUrl.searchParams.set('X-Amz-Expires', '900'); // 900 seconds
    const signedReq = await this.awsClient.sign(fileUrl.toString(), {
      method: 'PUT',
      aws: {
        service: 's3',
        signQuery: true,
      },
    });
    return signedReq.url;
  }
  async generateDownloadUrl(
    namespaceId: string,
    fileId: string,
    internal: boolean,
  ): Promise<string> {
    const file = await this.getFile(namespaceId, fileId);
    if (!file) {
      const message = this.i18n.t('resource.errors.fileNotFound');
      throw new AppException(message, 'FILE_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const s3Url = internal ? this.s3InternalUrl : this.s3Url;
    const fileUrl = new URL(`${namespaceId}/${fileId}`, s3Url);
    fileUrl.searchParams.set('X-Amz-Expires', '900'); // 900 seconds
    fileUrl.searchParams.set(
      'response-content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );

    const signedReq = await this.awsClient.sign(fileUrl.toString(), {
      method: 'GET',
      aws: {
        service: 's3',
        signQuery: true,
      },
    });
    return signedReq.url;
  }
}
