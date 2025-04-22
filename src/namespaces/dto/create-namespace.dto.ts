import { IsArray, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateNamespaceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  collaborators?: string[];
}
