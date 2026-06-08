import { Expose } from 'class-transformer';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';

export class ListResponseDto {
  @Expose({ name: 'parent_id' })
  parentId: string;

  @Expose({ name: 'parent_path' })
  parentPath: string;

  resources: FileInfoDto[];

  total: number;
}
