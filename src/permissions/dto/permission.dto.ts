import { Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { PermissionLevel } from '../permission-level.enum';

@Expose()
export class PermissionDto {
  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  level: PermissionLevel;
}
