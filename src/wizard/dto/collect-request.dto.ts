import { IsNotEmpty, IsString } from 'class-validator';

export class CollectZRequestDto {
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

export class CollectRequestDto extends CollectZRequestDto {
  @IsString()
  @IsNotEmpty()
  html: string;
}
