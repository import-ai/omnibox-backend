import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class UpdateNamespaceDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;
}
