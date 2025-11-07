import { Expose } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateFileReqDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  name: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  mimetype: string;

  @Expose()
  @IsNumber()
  @Min(1)
  size: number;
}
