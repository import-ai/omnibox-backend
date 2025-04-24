import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { SpaceType } from 'src/resources/resources.entity';

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
  namespace: string;

  @IsEnum(SpaceType)
  @IsNotEmpty()
  spaceType: SpaceType;
}
