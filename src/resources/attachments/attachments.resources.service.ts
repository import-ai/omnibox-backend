import { InjectRepository } from '@nestjs/typeorm';
import encodeFileName from 'src/utils/encode-filename';
import { DataSource, Repository } from 'typeorm';
import { Resource } from 'src/resources/resources.entity';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { Task } from 'src/tasks/tasks.entity';
import { MinioService } from 'src/resources/minio/minio.service';
import { PermissionsService } from 'src/permissions/permissions.service';
import generateId from 'src/utils/generate-id';
import { ResourcePermission } from 'src/permissions/resource-permission.enum';
import { objectStreamResponse } from 'src/resources/utils';

@Injectable()
export class ResourceAttachmentsService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly dataSource: DataSource,
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

  async uploadAttachments(
    namespaceId: string,
    resourceId: string,
    userId: string,
    files: Express.Multer.File[],
  ) {
    console.warn({
      namespaceId,
      resourceId,
      userId,
    });
    await this.checkPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    const failed: string[] = [];
    const uploaded: Record<string, string>[] = [];

    for (const file of files) {
      try {
        const originalName: string = encodeFileName(file.originalname);
        file.originalname = originalName;
        const uuid: string = generateId(16);
        const ext: string = originalName.substring(
          originalName.lastIndexOf('.'),
          originalName.length,
        );
        const filename: string = `${uuid}${ext}`;
        await this.minioService.put(originalName, file.buffer, file.mimetype, {
          metadata: { namespaceId, resourceId, userId },
          savePath: filename,
        });
        uploaded.push({
          name: originalName,
          link: filename,
        });
      } catch (e) {
        console.error(e);
        failed.push(file.originalname);
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
    const objectResponse = await this.minioService.get(attachmentId);
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
    await this.minioService.removeObject(attachmentId);
    return { success: true };
  }
}
