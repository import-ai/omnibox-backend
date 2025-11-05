import { IsString, MaxLength } from 'class-validator';

export class CreateUserOptionDto {
  @IsString()
  @MaxLength(64)
  name: string;

  @IsString()
  value: string;
}
