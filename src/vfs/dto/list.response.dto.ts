import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';

export interface listResponseDto {
  id: string;
  path: string;
  resources: FileInfoDto[];
  total: number;
}
