import { IsString, MaxLength } from 'class-validator';

export class CreateUserOptionDto {
  @IsString()
  @MaxLength(20)
  name: string;

  @IsString()
  value: string;
}
