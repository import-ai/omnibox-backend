import { IsNotEmpty, IsString } from 'class-validator';

export class CompressedCollectRequestDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  parentId: string;
}

export class CollectRequestDto extends CompressedCollectRequestDto {
  @IsString()
  @IsNotEmpty()
  html: string;
}
