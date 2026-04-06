import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';

export interface listResponseDto {
  path: string;
  resources: FileInfoDto[];
  total: number;
}
