import { ResourceDto } from 'omniboxd/namespace-resources/dto/resource.dto';
import { Expose } from 'class-transformer';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';

export class VfsResourceResponseDto extends ResourceDto {
  @Expose({ name: 'vfs_name' })
  vfsName: string;

  @Expose({ name: 'vfs_path' })
  vfsPath: string;

  @Expose({ name: 'is_folder' })
  isFolder: boolean;

  @Expose({ name: 'has_children' })
  hasChildren: boolean;

  static fromDto(
    resourceDto: ResourceDto,
    fileInfoDto: FileInfoDto,
  ): VfsResourceResponseDto {
    const dto = new VfsResourceResponseDto();
    Object.assign(dto, resourceDto);
    if (!fileInfoDto.name) {
      throw new Error('vfs name is empty');
    }
    dto.vfsName = fileInfoDto.name;
    if (!fileInfoDto.path) {
      throw new Error('vfs path is empty');
    }
    dto.vfsPath = fileInfoDto.path;
    dto.isFolder = fileInfoDto.isFolder;
    dto.hasChildren = fileInfoDto.hasChildren;
    return dto;
  }
}
