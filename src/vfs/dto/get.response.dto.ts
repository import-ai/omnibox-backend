import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';

export class GetResponseDto extends FileInfoDto {
  content: string;
}
