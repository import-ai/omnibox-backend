import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { File } from './entities/file.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { PresignedPost } from '@aws-sdk/s3-presigned-post';
import { formatFileSize } from '../utils/format-file-size';
import { S3Service } from 'omniboxd/s3/s3.service';

const s3Prefix = 'uploaded-files';

@Injectable()
export class FilesService {
  private readonly s3MaxFileSize: number;

  constructor(
    configService: ConfigService,

    @InjectRepository(File)
    private readonly fileRepo: Repository<File>,
    private readonly i18n: I18nService,
    private readonly s3Service: S3Service,
  ) {
    this.s3MaxFileSize = configService.get<number>(
      'OBB_S3_MAX_FILE_SIZE',
      20 * 1024 * 1024,
    );
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

  async generateUploadForm(
    fileId: string,
    fileSize: number | undefined,
    filename: string,
    mimetype: string,
  ): Promise<PresignedPost> {
    if (fileSize && fileSize > this.s3MaxFileSize) {
      const message = this.i18n.t('resource.errors.fileTooLarge', {
        args: {
          userSize: formatFileSize(fileSize),
          limitSize: formatFileSize(this.s3MaxFileSize),
        },
      });
      throw new AppException(message, 'FILE_TOO_LARGE', HttpStatus.BAD_REQUEST);
    }
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
    return await this.s3Service.generateUploadForm(
      `${s3Prefix}/${fileId}`,
      true,
      mimetype,
      disposition,
      this.s3MaxFileSize,
    );
  }

  async uploadFile(file: File, data: Express.Multer.File): Promise<void> {
    if (data.size > this.s3MaxFileSize) {
      const message = this.i18n.t('resource.errors.fileTooLarge', {
        args: {
          userSize: formatFileSize(data.size),
          limitSize: formatFileSize(this.s3MaxFileSize),
        },
      });
      throw new AppException(message, 'FILE_TOO_LARGE', HttpStatus.BAD_REQUEST);
    }
    await this.s3Service.putObject(
      `${s3Prefix}/${file.id}`,
      data.stream,
      file.mimetype,
    );
  }

  async generateDownloadUrl(
    namespaceId: string,
    fileId: string,
    isPublic: boolean,
  ): Promise<string> {
    const file = await this.getFile(namespaceId, fileId);
    if (!file) {
      const message = this.i18n.t('resource.errors.fileNotFound');
      throw new AppException(message, 'FILE_NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`;
    return await this.s3Service.generateDownloadUrl(
      `${s3Prefix}/${fileId}`,
      isPublic,
      disposition,
    );
  }
}
