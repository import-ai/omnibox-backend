import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';

export class FilterResponseDto {
  resources: FileInfoDto[];

  total: number;
}
