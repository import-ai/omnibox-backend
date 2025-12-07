import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { File } from 'omniboxd/files/entities/file.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourceAttachment } from 'omniboxd/attachments/entities/resource-attachment.entity';
import { S3Service } from 'omniboxd/s3/s3.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { S3UsageResponseDto } from './dto/s3-usage-response.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

const FILES_S3_PREFIX = 'uploaded-files';
const ATTACHMENTS_S3_PREFIX = 'attachments';

@Injectable()
export class S3UsageService {
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

  async getS3Usage(
    userId: string,
    namespaceId: string,
    resourceId?: string,
    recursive?: boolean,
  ): Promise<S3UsageResponseDto> {
    if (resourceId) {
      return this.getResourceUsage(userId, namespaceId, resourceId, recursive);
    }
    return this.getNamespaceUsage(namespaceId);
  }

  private async getNamespaceUsage(
    namespaceId: string,
  ): Promise<S3UsageResponseDto> {
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

    const filesBytes = fileSizes.reduce((sum, size) => sum + size, 0);
    const attachmentsBytes = attachmentSizes.reduce(
      (sum, size) => sum + size,
      0,
    );

    return {
      totalBytes: filesBytes + attachmentsBytes,
      breakdown: {
        files: { count: files.length, bytes: filesBytes },
        attachments: {
          count: uniqueAttachmentIds.length,
          bytes: attachmentsBytes,
        },
      },
    };
  }

  private async getResourceUsage(
    userId: string,
    namespaceId: string,
    resourceId: string,
    recursive?: boolean,
  ): Promise<S3UsageResponseDto> {
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

    const filesBytes = fileSizes.reduce((sum, size) => sum + size, 0);
    const attachmentsBytes = attachmentSizes.reduce(
      (sum, size) => sum + size,
      0,
    );

    return {
      totalBytes: filesBytes + attachmentsBytes,
      breakdown: {
        files: { count: fileIds.length, bytes: filesBytes },
        attachments: {
          count: uniqueAttachmentIds.length,
          bytes: attachmentsBytes,
        },
      },
    };
  }

  private async getObjectSize(key: string): Promise<number> {
    const meta = await this.s3Service.headObject(key);
    return meta?.contentLength ?? 0;
  }
}
