import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreateNamespaceDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(32)
  name: string;
}
