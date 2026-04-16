import { CollectUrlResponseDto } from 'omniboxd/wizard/dto/collect-url-request.dto';
import { Expose } from 'class-transformer';

export class VfsCollectUrlResponseDto extends CollectUrlResponseDto {
  @Expose({ name: 'parent_id' })
  parentId: string;
}
