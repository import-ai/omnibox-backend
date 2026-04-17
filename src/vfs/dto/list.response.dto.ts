import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';
import { Expose } from 'class-transformer';

export class ListResponseDto {
  @Expose({ name: 'parent_id' })
  parentId: string;

  @Expose({ name: 'parent_path' })
  parentPath: string;

  resources: FileInfoDto[];

  total: number;
}
