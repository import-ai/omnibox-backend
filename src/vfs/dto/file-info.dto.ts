import { Expose } from 'class-transformer';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export class FileInfoDto {
  id: string;

  name?: string;

  path?: string;

  size?: string;

  @Expose({ name: 'created_at' })
  createdAt: string;

  @Expose({ name: 'updated_at' })
  updatedAt: string;

  @Expose({ name: 'is_dir' })
  isDir: boolean;

  @Expose({ name: 'mime_type' })
  mimeType?: string;

  static getName(
    resourceName: string,
    resourceId: string,
    getDir: boolean,
  ): string {
    if (resourceName === '') {
      resourceName = `Untitled-${resourceId}`;
    }
    if (!getDir) {
      resourceName = `${resourceName}.md`;
    }
    return resourceName;
  }

  static isDir(resource: ResourceSummaryDto): boolean {
    return (
      resource.hasChildren || resource.resourceType === ResourceType.FOLDER
    );
  }

  static fromResourceSummaryDto(
    resource: ResourceSummaryDto,
    getDir: boolean,
    parentPath?: string,
  ): FileInfoDto {
    const fileInfo = new FileInfoDto();
    fileInfo.id = resource.id;
    fileInfo.name = FileInfoDto.getName(resource.name, resource.id, getDir);
    if (parentPath) {
      fileInfo.path = `${parentPath}/${fileInfo.name}`;
    }
    fileInfo.createdAt = resource.createdAt.toISOString();
    fileInfo.updatedAt = resource.updatedAt.toISOString();
    if (!FileInfoDto.isDir(resource) && getDir) {
      throw new Error(`${resource.id} is not a directory`);
    }
    fileInfo.isDir = getDir;
    return fileInfo;
  }
}
