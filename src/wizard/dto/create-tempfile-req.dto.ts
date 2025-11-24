import { Expose } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class CreateTempfileReqDto {
  @Expose()
  @IsOptional()
  @IsString()
  filename?: string;
}
