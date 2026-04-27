import { Expose } from 'class-transformer';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { SharedResourceDto } from 'omniboxd/shared-resources/dto/shared-resource.dto';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';

export class SharedVfsResourceResponseDto extends SharedResourceDto {
  @Expose({ name: 'vfs_name' })
  vfsName: string;

  @Expose({ name: 'vfs_path' })
  vfsPath: string;

  @Expose({ name: 'vfs_type' })
  vfsType: ResourceType.FOLDER | ResourceType.FILE;

  @Expose({ name: 'has_children' })
  hasChildren: boolean;

  static fromDto(
    sharedResourceDto: SharedResourceDto,
    fileInfoDto: FileInfoDto,
  ): SharedVfsResourceResponseDto {
    const dto = new SharedVfsResourceResponseDto();
    Object.assign(dto, sharedResourceDto);
    if (!fileInfoDto.name) {
      throw new Error('vfs name is empty');
    }
    dto.vfsName = fileInfoDto.name;
    if (!fileInfoDto.path) {
      throw new Error('vfs path is empty');
    }
    dto.vfsPath = fileInfoDto.path;
    dto.vfsType = fileInfoDto.type;
    dto.hasChildren = fileInfoDto.hasChildren;
    return dto;
  }
}
