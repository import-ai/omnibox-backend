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
  chunk_index: number;

  @IsNumber()
  @Min(1)
  total_chunks: number;

  @IsString()
  @IsNotEmpty()
  data: string;

  @IsBoolean()
  is_final_chunk: boolean;
}
