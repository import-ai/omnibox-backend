import { IsString, MaxLength } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MaxLength(20)
  name: string;
}
