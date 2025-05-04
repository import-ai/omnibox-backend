import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class TaskCallbackDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  ended_at: string;

  @IsOptional()
  exception: Record<string, any>;

  @IsOptional()
  output: Record<string, any>;
}
