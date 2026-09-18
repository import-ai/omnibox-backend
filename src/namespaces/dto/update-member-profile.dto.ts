import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateMemberProfileDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  nickname?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(128)
  note?: string | null;
}
