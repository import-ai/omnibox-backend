import {
  encodeFileName,
  getOriginalFileName,
} from 'omniboxd/utils/encode-filename';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { MinioService } from 'omniboxd/minio/minio.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { objectStreamResponse } from 'omniboxd/minio/utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { ResourceAttachment } from './entities/resource-attachment.entity';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    @InjectRepository(ResourceAttachment)
    private readonly resourceAttachmentRepository: Repository<ResourceAttachment>,
    private readonly minioService: MinioService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async checkPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
    permission: ResourcePermission = ResourcePermission.CAN_VIEW,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      permission,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
  }

  minioPath(attachmentId: string): string {
    return `attachments/${attachmentId}`;
  }

  async getRelationOrFail(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
  ) {
    const relation = await this.resourceAttachmentRepository.findOne({
      where: {
        namespaceId,
        resourceId,
        attachmentId,
      },
    });

    if (!relation) {
      throw new NotFoundException(attachmentId);
    }

    return relation;
  }

  async uploadAttachment(
    namespaceId: string,
    resourceId: string,
    userId: string,
    filename: string,
    buffer: Buffer,
    mimetype: string,
  ) {
    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    const { id } = await this.minioService.put(filename, buffer, mimetype, {
      folder: 'attachments',
    });

    // Create the resource-attachment relation
    const resourceAttachment = this.resourceAttachmentRepository.create({
      namespaceId,
      resourceId,
      attachmentId: id,
    });
    await this.resourceAttachmentRepository.save(resourceAttachment);

    return id;
  }

  async uploadAttachments(
    namespaceId: string,
    resourceId: string,
    userId: string,
    files: Express.Multer.File[],
  ) {
    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    const failed: string[] = [];
    const uploaded: Record<string, string>[] = [];

    for (const file of files) {
      const originalName = getOriginalFileName(file.originalname); // Get corrected original name
      try {
        const filename: string = encodeFileName(file.originalname);
        const id = await this.uploadAttachment(
          namespaceId,
          resourceId,
          userId,
          filename,
          file.buffer,
          file.mimetype,
        );
        uploaded.push({
          name: originalName, // Use corrected original name in response
          link: id,
        });
      } catch (error) {
        this.logger.error({ error });
        failed.push(originalName); // Use corrected original name in failed array
      }
    }

    return { uploaded, failed };
  }

  async downloadAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
    httpResponse: Response,
  ) {
    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );
    await this.getRelationOrFail(namespaceId, resourceId, attachmentId);

    const objectResponse = await this.minioService.get(
      this.minioPath(attachmentId),
    );
    return objectStreamResponse(objectResponse, httpResponse);
  }

  async deleteAttachment(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    const relation = await this.getRelationOrFail(
      namespaceId,
      resourceId,
      attachmentId,
    );
    await this.resourceAttachmentRepository.softRemove(relation);
    return { id: attachmentId, success: true };
  }

  isMedia(mimetype: string): boolean {
    for (const type of ['image/', 'audio/']) {
      if (mimetype.startsWith(type)) {
        return true;
      }
    }
    return false;
  }

  async displayMedia(
    namespaceId: string,
    resourceId: string,
    attachmentId: string,
    userId: string,
    httpResponse: Response,
  ) {
    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );

    await this.getRelationOrFail(namespaceId, resourceId, attachmentId);

    const objectResponse = await this.minioService.get(
      this.minioPath(attachmentId),
    );

    if (!this.isMedia(objectResponse.mimetype)) {
      throw new BadRequestException(attachmentId);
    }

    return objectStreamResponse(objectResponse, httpResponse, {
      forceDownload: false,
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
}
