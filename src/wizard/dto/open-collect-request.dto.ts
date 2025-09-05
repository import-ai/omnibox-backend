import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class OpenCollectRequestDto {
  @IsString()
  @IsNotEmpty()
  html: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  parentId?: string;
}
