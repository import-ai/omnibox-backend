import { IsString } from 'class-validator';

export class UpdateUserOptionDto {
  @IsString()
  value: string;
}
