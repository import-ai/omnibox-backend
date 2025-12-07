import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { File } from 'omniboxd/files/entities/file.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourceAttachment } from 'omniboxd/attachments/entities/resource-attachment.entity';
import { S3Service } from 'omniboxd/s3/s3.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { StorageUsageResponseDto } from './dto/storage-usage-response.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

const FILES_S3_PREFIX = 'uploaded-files';
const ATTACHMENTS_S3_PREFIX = 'attachments';

@Injectable()
export class StorageUsageService {
  constructor(
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,

    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,

    @InjectRepository(ResourceAttachment)
    private readonly resourceAttachmentRepository: Repository<ResourceAttachment>,

    private readonly s3Service: S3Service,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly i18n: I18nService,
  ) {}

  async getStorageUsage(
    userId: string,
    namespaceId: string,
    resourceId?: string,
    recursive?: boolean,
  ): Promise<StorageUsageResponseDto> {
    if (resourceId) {
      return this.getResourceUsage(userId, namespaceId, resourceId, recursive);
    }
    return this.getNamespaceUsage(namespaceId);
  }

  private async getNamespaceUsage(
    namespaceId: string,
  ): Promise<StorageUsageResponseDto> {
    // Get all files in the namespace
    const files = await this.fileRepository.find({
      where: { namespaceId },
      select: ['id'],
    });

    // Get all attachments in the namespace
    const attachments = await this.resourceAttachmentRepository.find({
      where: { namespaceId },
      select: ['attachmentId'],
    });

    // Get unique attachment IDs
    const uniqueAttachmentIds = [
      ...new Set(attachments.map((a) => a.attachmentId)),
    ];

    // Calculate file sizes in parallel
    const fileSizes = await Promise.all(
      files.map((file) => this.getObjectSize(`${FILES_S3_PREFIX}/${file.id}`)),
    );

    // Calculate attachment sizes in parallel
    const attachmentSizes = await Promise.all(
      uniqueAttachmentIds.map((attachmentId) =>
        this.getObjectSize(`${ATTACHMENTS_S3_PREFIX}/${attachmentId}`),
      ),
    );

    // Calculate content sizes from PostgreSQL
    const contentStats = await this.getContentStats(namespaceId);

    const filesBytes = fileSizes.reduce((sum, size) => sum + size, 0);
    const attachmentsBytes = attachmentSizes.reduce(
      (sum, size) => sum + size,
      0,
    );

    return {
      totalBytes: filesBytes + attachmentsBytes + contentStats.bytes,
      breakdown: {
        files: { count: files.length, bytes: filesBytes },
        attachments: {
          count: uniqueAttachmentIds.length,
          bytes: attachmentsBytes,
        },
        contents: contentStats,
      },
    };
  }

  private async getResourceUsage(
    userId: string,
    namespaceId: string,
    resourceId: string,
    recursive?: boolean,
  ): Promise<StorageUsageResponseDto> {
    // Get the resource to verify it exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId, namespaceId },
      select: ['id', 'fileId'],
    });

    if (!resource) {
      throw new AppException(
        this.i18n.t('resource.errors.resourceNotFound'),
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    let resourceIds: string[];
    let fileIds: (string | null)[];

    if (recursive) {
      // Get all sub-resources recursively
      const subResources =
        await this.namespaceResourcesService.getAllSubResourcesByUser(
          userId,
          namespaceId,
          resourceId,
        );

      // Get fileIds for all sub-resources
      const subResourceIds = subResources.map((r) => r.id);
      resourceIds = [resourceId, ...subResourceIds];

      // Query resources to get their fileIds
      const resourcesWithFileIds = await this.resourceRepository.find({
        where: { id: In(resourceIds), namespaceId },
        select: ['id', 'fileId'],
      });

      fileIds = resourcesWithFileIds
        .map((r) => r.fileId)
        .filter((id): id is string => id !== null);
    } else {
      resourceIds = [resourceId];
      fileIds = resource.fileId ? [resource.fileId] : [];
    }

    // Get attachments for all resource IDs
    const attachments = await this.resourceAttachmentRepository.find({
      where: { namespaceId, resourceId: In(resourceIds) },
      select: ['attachmentId'],
    });

    const uniqueAttachmentIds = [
      ...new Set(attachments.map((a) => a.attachmentId)),
    ];

    // Calculate file sizes in parallel
    const fileSizes = await Promise.all(
      fileIds.map((fileId) =>
        this.getObjectSize(`${FILES_S3_PREFIX}/${fileId}`),
      ),
    );

    // Calculate attachment sizes in parallel
    const attachmentSizes = await Promise.all(
      uniqueAttachmentIds.map((attachmentId) =>
        this.getObjectSize(`${ATTACHMENTS_S3_PREFIX}/${attachmentId}`),
      ),
    );

    // Calculate content sizes for the specific resources
    const contentStats = await this.getContentStatsByResourceIds(resourceIds);

    const filesBytes = fileSizes.reduce((sum, size) => sum + size, 0);
    const attachmentsBytes = attachmentSizes.reduce(
      (sum, size) => sum + size,
      0,
    );

    return {
      totalBytes: filesBytes + attachmentsBytes + contentStats.bytes,
      breakdown: {
        files: { count: fileIds.length, bytes: filesBytes },
        attachments: {
          count: uniqueAttachmentIds.length,
          bytes: attachmentsBytes,
        },
        contents: contentStats,
      },
    };
  }

  private async getContentStats(
    namespaceId: string,
  ): Promise<{ count: number; bytes: number }> {
    const result = await this.resourceRepository
      .createQueryBuilder('resource')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(octet_length(resource.content)), 0)', 'bytes')
      .where('resource.namespaceId = :namespaceId', { namespaceId })
      .andWhere('resource.deletedAt IS NULL')
      .getRawOne();

    return {
      count: parseInt(result.count, 10),
      bytes: parseInt(result.bytes, 10),
    };
  }

  private async getContentStatsByResourceIds(
    resourceIds: string[],
  ): Promise<{ count: number; bytes: number }> {
    if (resourceIds.length === 0) {
      return { count: 0, bytes: 0 };
    }

    const result = await this.resourceRepository
      .createQueryBuilder('resource')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(octet_length(resource.content)), 0)', 'bytes')
      .where('resource.id IN (:...resourceIds)', { resourceIds })
      .andWhere('resource.deletedAt IS NULL')
      .getRawOne();

    return {
      count: parseInt(result.count, 10),
      bytes: parseInt(result.bytes, 10),
    };
  }

  private async getObjectSize(key: string): Promise<number> {
    const meta = await this.s3Service.headObject(key);
    return meta?.contentLength ?? 0;
  }
}
