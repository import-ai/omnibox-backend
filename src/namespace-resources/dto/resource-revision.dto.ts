import { ResourceRevision } from 'omniboxd/resources/entities/resource-revision.entity';

export class ResourceRevisionDto {
  id: string;
  resourceId: string;
  name: string;
  content: string;
  tagIds: string[];
  createdAt: string;
  updatedByUserId: string | null;

  static fromEntity(revision: ResourceRevision): ResourceRevisionDto {
    const dto = new ResourceRevisionDto();
    dto.id = revision.id;
    dto.resourceId = revision.resourceId;
    dto.name = revision.name;
    dto.content = revision.content;
    dto.tagIds = revision.tagIds ?? [];
    dto.createdAt = revision.createdAt.toISOString();
    dto.updatedByUserId = revision.updatedByUserId;
    return dto;
  }
}
