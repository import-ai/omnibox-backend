import { IsString, IsNotEmpty } from 'class-validator';

export class CreateNamespaceDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
