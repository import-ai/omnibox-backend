import { IsNotEmpty, IsString } from 'class-validator';
import { Expose } from 'class-transformer';

@Expose()
export class MemberDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  username: string;

  @IsString()
  @IsNotEmpty()
  email: string;
}
