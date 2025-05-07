import { Expose } from 'class-transformer';
import { IsBoolean, IsNotEmpty } from 'class-validator';

@Expose()
export class PermissionDto {
  @IsBoolean()
  @IsNotEmpty()
  read: boolean;

  @IsBoolean()
  @IsNotEmpty()
  write: boolean;

  @IsBoolean()
  @IsNotEmpty()
  comment: boolean;

  @IsBoolean()
  @IsNotEmpty()
  share: boolean;

  @IsBoolean()
  @IsNotEmpty()
  @Expose({ name: 'no_access' })
  noAccess: boolean;
}
