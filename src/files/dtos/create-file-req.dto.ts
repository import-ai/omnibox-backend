import { Expose } from 'class-transformer';
import { IsHexadecimal, IsNotEmpty, Length } from 'class-validator';

export class CreateFileReqDto {
  @Expose()
  @IsHexadecimal()
  @Length(64)
  sha256: string;
}
