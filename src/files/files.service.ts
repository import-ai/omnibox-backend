import { HttpStatus, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { File } from './entities/file.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { PresignedPost } from '@aws-sdk/s3-presigned-post';
import { formatFileSize } from '../utils/format-file-size';
import { ObjectMeta, S3Service } from 'omniboxd/s3/s3.service';
import { extname } from 'path';
import * as mime from 'mime-types';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';

const s3Prefix = 'uploaded-files';

const ALLOWED_FILE_EXTENSIONS = new Set([
  // doc
  '.md',
  '.doc',
  '.ppt',
  '.docx',
  '.pptx',
  '.txt',
  '.pdf',
  // audio
  '.wav',
  '.mp3',
  '.m4a',
  '.pcm',
  '.opus',
  '.webm',
  // video
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',
  '.flv',
  // image
  '.jpg',
  '.jpeg',
  '.png',
]);

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(File)
    private readonly fileRepo: Repository<File>,
    private readonly i18n: I18nService,
    private readonly s3Service: S3Service,
    private readonly namespacesQuotaService: NamespacesQuotaService,
  ) {}

  async createFile(
    userId: string,
    namespaceId: string,
    filename: string,
    size: number,
    mimetype?: string,
  ): Promise<File> {
    const usage =
      await this.namespacesQuotaService.getNamespaceUsage(namespaceId);
    if (usage.fileUploadSizeLimit > 0 && size > usage.fileUploadSizeLimit) {
      const message = this.i18n.t('resource.errors.fileTooLarge', {
        args: {
          userSize: formatFileSize(size),
          limitSize: formatFileSize(usage.fileUploadSizeLimit),
        },
      });
      throw new AppException(message, 'FILE_TOO_LARGE', HttpStatus.BAD_REQUEST);
    }
    const extension = extname(filename).toLowerCase();
    if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
      const message = this.i18n.t('resource.errors.fileTypeNotSupported');
      throw new AppException(
        message,
        'FILE_TYPE_NOT_SUPPORTED',
        HttpStatus.BAD_REQUEST,
      );
    }
    mimetype = mimetype || mime.lookup(filename) || 'application/octet-stream';
    return await this.fileRepo.save(
      this.fileRepo.create({
        namespaceId,
        userId,
        name: filename,
        mimetype,
        size,
      }),
    );
  }

  async getFile(namespaceId: string, fileId: string): Promise<File | null> {
    return await this.fileRepo.findOne({ where: { namespaceId, id: fileId } });
  }

  async generateUploadForm(
    fileId: string,
    fileSize: number,
    filename: string,
  ): Promise<PresignedPost> {
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
    return await this.s3Service.generateUploadForm(
      `${s3Prefix}/${fileId}`,
      true,
      disposition,
      fileSize,
    );
  }

  async uploadFile(file: File, buffer: Buffer): Promise<void> {
    await this.s3Service.putObject(
      `${s3Prefix}/${file.id}`,
      buffer,
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

  async headFile(fileId: string): Promise<ObjectMeta | null> {
    return await this.s3Service.headObject(`${s3Prefix}/${fileId}`);
  }

  async recalculateFileSizes(
    namespaceId?: string,
    batchSize: number = 100,
  ): Promise<{
    processed: number;
  }> {
    let processed = 0;

    while (true) {
      const files = await this.fileRepo.find({
        where: {
          size: 0,
          namespaceId,
        },
        take: batchSize,
      });
      if (files.length === 0) {
        break;
      }
      for (const file of files) {
        const meta = await this.headFile(file.id);
        const size = meta?.contentLength ?? 0;
        if (size === 0) {
          return { processed };
        }
        const result = await this.fileRepo.update(
          { id: file.id, size: 0 },
          { size },
        );
        if (result.affected === 1) {
          processed++;
        }
      }
    }

    return { processed };
  }
}
