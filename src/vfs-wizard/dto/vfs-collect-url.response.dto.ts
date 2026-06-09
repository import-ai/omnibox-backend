import { Expose } from 'class-transformer';
import { CollectUrlResponseDto } from 'omniboxd/wizard/dto/collect-url-request.dto';

export class VfsCollectUrlResponseDto extends CollectUrlResponseDto {
  @Expose({ name: 'parent_id' })
  parentId: string;
}
