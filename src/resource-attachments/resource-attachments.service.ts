import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { ResourceAttachment } from 'omniboxd/attachments/entities/resource-attachment.entity';

@Injectable()
export class ResourceAttachmentsService {
  constructor(
    @InjectRepository(ResourceAttachment)
    private readonly resourceAttachmentRepository: Repository<ResourceAttachment>,
    private readonly i18n: I18nService,
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
  ) {
    const resourceAttachment = this.resourceAttachmentRepository.create({
      namespaceId,
      resourceId,
      attachmentId,
    });
    await this.resourceAttachmentRepository.save(resourceAttachment);
  }

  async removeAttachmentFromResource(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
  ) {
    const existingAttachment = await this.resourceAttachmentRepository.findOne({
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

    await this.resourceAttachmentRepository.softDelete({
      namespaceId,
      resourceId,
      attachmentId,
    });
  }

  async copyAttachmentsToResource(
    namespaceId: string,
    sourceResourceId: string,
    targetResourceId: string,
    entityManager?: EntityManager,
  ) {
    const repository = entityManager
      ? entityManager.getRepository(ResourceAttachment)
      : this.resourceAttachmentRepository;

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
      }),
    );

    if (newRelations.length > 0) {
      await repository.save(newRelations);
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
}
