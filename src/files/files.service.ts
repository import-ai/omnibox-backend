import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource, IsNull, Repository } from 'typeorm';
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
import { UsagesService } from 'omniboxd/usages/usages.service';
import { StorageType } from 'omniboxd/usages/entities/storage-usage.entity';
import { transaction } from 'omniboxd/utils/transaction-utils';

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
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectRepository(File)
    private readonly fileRepo: Repository<File>,
    private readonly i18n: I18nService,
    private readonly s3Service: S3Service,
    private readonly namespacesQuotaService: NamespacesQuotaService,
    private readonly usagesService: UsagesService,
    private readonly dataSource: DataSource,
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
          size: IsNull(),
          namespaceId,
        },
        take: batchSize,
      });
      if (files.length === 0) {
        break;
      }
      const maxConcurrency = 10;
      for (let i = 0; i < files.length; i += maxConcurrency) {
        const chunk = files.slice(i, i + maxConcurrency);
        await Promise.allSettled(
          chunk.map(async (file) => {
            const meta = await this.headFile(file.id);
            const size = meta?.contentLength ?? 0;
            await transaction(this.dataSource.manager, async (tx) => {
              const result = await tx.entityManager.update(
                File,
                { id: file.id, size: IsNull() },
                { size },
              );
              if (result.affected !== 1) {
                return;
              }
              if (size > 0) {
                await this.usagesService.updateStorageUsage(
                  file.namespaceId,
                  file.userId,
                  StorageType.UPLOAD,
                  size,
                  tx,
                );
              }
            });
          }),
        );
        processed += chunk.length;
      }
      this.logger.log(`Processed ${processed} files`);
    }
    return { processed };
  }
}
