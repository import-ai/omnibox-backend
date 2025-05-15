import { IsNotEmpty, IsString } from 'class-validator';
import { Expose } from 'class-transformer';

export class GroupUserDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  id: string;

  @Expose()
  @IsString()
  username: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  email: string;
}
