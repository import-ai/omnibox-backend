import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';

export class ChunkCallbackDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsNumber()
  @Min(0)
  chunkIndex: number;

  @IsNumber()
  @Min(1)
  totalChunks: number;

  @IsString()
  @IsNotEmpty()
  data: string;

  @IsBoolean()
  isFinalChunk: boolean;
}
