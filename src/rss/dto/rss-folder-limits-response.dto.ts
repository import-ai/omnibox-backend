import { Expose } from 'class-transformer';
import { NamespaceTier } from 'omniboxd/namespaces/dto/namespace-tier.enum';

export class RssFolderLimitsResponseDto {
  @Expose()
  tier: NamespaceTier;
  @Expose({ name: 'link_limit' })
  linkLimit: number;

  static fromValues(
    values: RssFolderLimitsResponseDto,
  ): RssFolderLimitsResponseDto {
    const dto = new RssFolderLimitsResponseDto();
    dto.tier = values.tier;
    dto.linkLimit = values.linkLimit;
    return dto;
  }
}
