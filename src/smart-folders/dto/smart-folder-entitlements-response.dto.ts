export type SmartFolderTier = 'basic' | 'premium';

export class SmartFolderEntitlementsResponseDto {
  tier: SmartFolderTier;
  privateLimit: number;
  teamLimit: number;
  privateUsed: number;
  teamUsed: number;
  ruleLimit: number;
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
