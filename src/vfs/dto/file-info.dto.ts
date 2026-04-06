import { Expose } from 'class-transformer';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export class FileInfoDto {
  id: string;

  name: string;

  size?: string;

  @Expose({ name: 'created_at' })
  createdAt: string;

  @Expose({ name: 'updated_at' })
  updatedAt: string;

  @Expose({ name: 'is_dir' })
  isDir: boolean;

  @Expose({ name: 'mime_type' })
  mimeType?: string;

  static isDir(resource: ResourceSummaryDto): boolean {
    return (
      resource.hasChildren || resource.resourceType === ResourceType.FOLDER
    );
  }

  static fromResourceSummaryDto(resource: ResourceSummaryDto): FileInfoDto {
    const fileInfo = new FileInfoDto();
    fileInfo.id = resource.id;
    fileInfo.name = resource.name || resource.id;
    fileInfo.createdAt = resource.createdAt.toISOString();
    fileInfo.updatedAt = resource.updatedAt.toISOString();
    fileInfo.isDir = FileInfoDto.isDir(resource);
    return fileInfo;
  }
}
