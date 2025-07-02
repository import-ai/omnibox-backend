import { IsNotEmpty, IsString } from 'class-validator';

export class CollectRequestDto {
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
  @IsNotEmpty()
  namespace_id: string;

  @IsString()
  @IsNotEmpty()
  parentId: string;
}
