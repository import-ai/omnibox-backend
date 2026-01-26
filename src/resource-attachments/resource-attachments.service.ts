import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource, IsNull, Not } from 'typeorm';
import { ResourceAttachment } from 'omniboxd/attachments/entities/resource-attachment.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { UsagesService } from 'omniboxd/usages/usages.service';
import { StorageType } from 'omniboxd/usages/entities/storage-usage.entity';
import { transaction, Transaction } from 'omniboxd/utils/transaction-utils';
import { S3Service } from 'omniboxd/s3/s3.service';

@Injectable()
export class ResourceAttachmentsService {
  constructor(
    @InjectRepository(ResourceAttachment)
    private readonly resourceAttachmentRepository: Repository<ResourceAttachment>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly i18n: I18nService,
    private readonly usagesService: UsagesService,
    private readonly dataSource: DataSource,
    private readonly s3Service: S3Service,
  ) {}

  async getResourceAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
  ) {
    return await this.resourceAttachmentRepository.findOne({
      where: {
        namespaceId,
        resourceId,
        attachmentId,
      },
    });
  }

  async getResourceAttachmentOrFail(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
  ) {
    const relation = await this.getResourceAttachment(
      namespaceId,
      resourceId,
      attachmentId,
    );
    if (!relation) {
      const message = this.i18n.t('attachment.errors.attachmentNotFound');
      throw new AppException(
        message,
        'ATTACHMENT_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return relation;
  }

  async addAttachmentToResource(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
    size: number,
  ) {
    return await transaction(this.dataSource.manager, async (tx) => {
      const repository = tx.entityManager.getRepository(ResourceAttachment);

      const resourceAttachment = repository.create({
        namespaceId,
        resourceId,
        attachmentId,
        attachmentSize: size,
      });
      await repository.save(resourceAttachment);

      // Update storage usage for attachment within the same transaction
      await this.usagesService.updateStorageUsage(
        namespaceId,
        userId,
        StorageType.ATTACHMENT,
        size,
        tx,
      );
    });
  }

  async removeAttachmentFromResource(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
  ) {
    return await transaction(this.dataSource.manager, async (tx) => {
      const repository = tx.entityManager.getRepository(ResourceAttachment);

      const existingAttachment = await repository.findOne({
        where: {
          namespaceId,
          resourceId,
          attachmentId,
        },
      });

      if (!existingAttachment) {
        const message = this.i18n.t('attachment.errors.attachmentNotFound');
        throw new AppException(
          message,
          'ATTACHMENT_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }

      await repository.softDelete({
        namespaceId,
        resourceId,
        attachmentId,
      });

      // Update storage usage for attachment (decrement) within the same transaction
      await this.usagesService.updateStorageUsage(
        namespaceId,
        userId,
        StorageType.ATTACHMENT,
        -existingAttachment.attachmentSize,
        tx,
      );
    });
  }

  async copyAttachmentsToResource(
    namespaceId: string,
    sourceResourceId: string,
    targetResourceId: string,
    userId: string,
    tx: Transaction,
  ) {
    const repository = tx.entityManager.getRepository(ResourceAttachment);

    const sourceRelations = await repository.find({
      where: {
        namespaceId,
        resourceId: sourceResourceId,
      },
    });

    const newRelations = sourceRelations.map((relation) =>
      repository.create({
        namespaceId,
        resourceId: targetResourceId,
        attachmentId: relation.attachmentId,
        attachmentSize: relation.attachmentSize,
      }),
    );

    if (newRelations.length > 0) {
      await repository.save(newRelations);

      // Update storage usage for all copied attachments within the same transaction
      const totalSize = sourceRelations.reduce(
        (sum, relation) => sum + Number(relation.attachmentSize),
        0,
      );
      if (totalSize > 0) {
        await this.usagesService.updateStorageUsage(
          namespaceId,
          userId,
          StorageType.ATTACHMENT,
          totalSize,
          tx,
        );
      }
    }

    return newRelations.length;
  }

  async listResourceAttachments(namespaceId: string, resourceId: string) {
    return await this.resourceAttachmentRepository.find({
      where: {
        namespaceId,
        resourceId,
      },
    });
  }

  async getFirstAttachments(
    namespaceId: string,
    resourceIds: string[],
  ): Promise<Map<string, string>> {
    const attachments = await this.resourceAttachmentRepository.find({
      where: { namespaceId, resourceId: In(resourceIds) },
      order: { id: 'ASC' },
    });
    const firstAttachments = new Map<string, string>();
    for (const attachment of attachments) {
      if (!firstAttachments.has(attachment.resourceId)) {
        firstAttachments.set(attachment.resourceId, attachment.attachmentId);
      }
    }
    return firstAttachments;
  }

  async recalculateAttachmentSizes(
    namespaceId?: string,
    batchSize: number = 100,
  ): Promise<{
    processed: number;
  }> {
    let processed = 0;

    while (true) {
      const attachments = await this.resourceAttachmentRepository.find({
        where: {
          attachmentSize: 0,
          namespaceId,
        },
        take: batchSize,
      });
      if (attachments.length === 0) {
        break;
      }
      for (const attachment of attachments) {
        const meta = await this.s3Service.headObject(
          `attachments/${attachment.attachmentId}`,
        );
        const attachmentSize = meta?.contentLength ?? 0;
        if (attachmentSize === 0) {
          return { processed };
        }

        const resource = await this.resourceRepository.findOne({
          where: {
            id: attachment.resourceId,
            namespaceId: attachment.namespaceId,
            userId: Not(IsNull()),
          },
        });
        if (!resource) {
          continue;
        }

        await transaction(this.dataSource.manager, async (tx) => {
          const result = await tx.entityManager.update(
            ResourceAttachment,
            { id: attachment.id, attachmentSize: 0 },
            { attachmentSize },
          );
          if (result.affected !== 1) {
            return;
          }
          await this.usagesService.updateStorageUsage(
            attachment.namespaceId,
            resource.userId!,
            StorageType.ATTACHMENT,
            attachmentSize,
            tx,
          );
        });

        processed++;
      }
    }

    return { processed };
  }
}
