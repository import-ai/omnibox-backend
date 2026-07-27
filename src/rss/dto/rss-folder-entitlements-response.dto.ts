import { Expose } from 'class-transformer';

export type RssFolderTier = 'basic' | 'premium';

export class RssFolderEntitlementsResponseDto {
  @Expose()
  tier: RssFolderTier;
  @Expose({ name: 'link_limit' })
  linkLimit: number;

  static fromValues(
    values: RssFolderEntitlementsResponseDto,
  ): RssFolderEntitlementsResponseDto {
    const dto = new RssFolderEntitlementsResponseDto();
    dto.tier = values.tier;
    dto.linkLimit = values.linkLimit;
    return dto;
  }
}
