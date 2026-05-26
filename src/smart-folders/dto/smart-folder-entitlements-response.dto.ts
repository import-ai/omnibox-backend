import { Expose } from 'class-transformer';

export type SmartFolderTier = 'basic' | 'premium';

export class SmartFolderEntitlementsResponseDto {
  @Expose()
  tier: SmartFolderTier;
  @Expose({ name: 'private_limit' })
  privateLimit: number;
  @Expose({ name: 'team_limit' })
  teamLimit: number;
  @Expose({ name: 'private_used' })
  privateUsed: number;
  @Expose({ name: 'team_used' })
  teamUsed: number;
  @Expose({ name: 'rule_limit' })
  ruleLimit: number;
  @Expose({ name: 'trash_retention_days' })
  trashRetentionDays: number;

  static fromValues(
    values: SmartFolderEntitlementsResponseDto,
  ): SmartFolderEntitlementsResponseDto {
    const dto = new SmartFolderEntitlementsResponseDto();
    dto.tier = values.tier;
    dto.privateLimit = values.privateLimit;
    dto.teamLimit = values.teamLimit;
    dto.privateUsed = values.privateUsed;
    dto.teamUsed = values.teamUsed;
    dto.ruleLimit = values.ruleLimit;
    dto.trashRetentionDays = values.trashRetentionDays;
    return dto;
  }
}
