import { Expose } from 'class-transformer';
import { NamespaceTier } from 'omniboxd/namespaces/dto/namespace-tier.enum';

export class RssFolderLimitsResponseDto {
  @Expose()
  tier: NamespaceTier;
  @Expose({ name: 'link_limit' })
  linkLimit: number;
  @Expose({ name: 'folder_private_limit' })
  folderPrivateLimit: number;
  @Expose({ name: 'folder_team_limit' })
  folderTeamLimit: number;
  @Expose({ name: 'folder_private_used' })
  folderPrivateUsed: number;
  @Expose({ name: 'folder_team_used' })
  folderTeamUsed: number;

  static fromValues(
    values: RssFolderLimitsResponseDto,
  ): RssFolderLimitsResponseDto {
    const dto = new RssFolderLimitsResponseDto();
    dto.tier = values.tier;
    dto.linkLimit = values.linkLimit;
    dto.folderPrivateLimit = values.folderPrivateLimit;
    dto.folderTeamLimit = values.folderTeamLimit;
    dto.folderPrivateUsed = values.folderPrivateUsed;
    dto.folderTeamUsed = values.folderTeamUsed;
    return dto;
  }
}
