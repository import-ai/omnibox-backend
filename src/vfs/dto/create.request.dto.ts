import { IsOptional, IsString } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  path: string;

  @IsString()
  @IsOptional()
  content?: string;
}
