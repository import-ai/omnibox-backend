import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { SpaceType } from 'src/namespaces/entities/namespace.entity';

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

  @IsEnum(SpaceType)
  @IsNotEmpty()
  space_type: SpaceType;
}
