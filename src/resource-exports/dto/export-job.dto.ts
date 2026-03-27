import { Expose, Transform } from 'class-transformer';
import {
  ExportStatus,
  ResourceExport,
} from '../entities/resource-export.entity';

export class ExportJobDto {
  @Expose()
  id: string;

  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  @Expose({ name: 'resource_id' })
  resourceId: string;

  @Expose()
  status: ExportStatus;

  @Expose({ name: 'total_resources' })
  totalResources: number;

  @Expose({ name: 'processed_resources' })
  processedResources: number;

  @Expose({ name: 'error_message' })
  errorMessage?: string;

  @Expose({ name: 'created_at' })
  @Transform(({ value }) => value?.toISOString())
  createdAt: Date;

  @Expose({ name: 'completed_at' })
  @Transform(({ value }) => value?.toISOString())
  completedAt?: Date;

  @Expose({ name: 'expires_at' })
  @Transform(({ value }) => value?.toISOString())
  expiresAt?: Date;

  static fromEntity(entity: ResourceExport): ExportJobDto {
    const dto = new ExportJobDto();
    dto.id = entity.id;
    dto.namespaceId = entity.namespaceId;
    dto.resourceId = entity.resourceId;
    dto.status = entity.status;
    dto.totalResources = entity.totalResources;
    dto.processedResources = entity.processedResources;
    dto.errorMessage = entity.errorMessage ?? undefined;
    dto.createdAt = entity.createdAt;
    dto.completedAt = entity.completedAt ?? undefined;
    dto.expiresAt = entity.expiresAt ?? undefined;
    return dto;
  }
}
