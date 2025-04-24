import { IsString, IsOptional, IsArray, IsNotEmpty } from 'class-validator';

export class UpdateNamespaceDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  collaborators?: string[];
}
