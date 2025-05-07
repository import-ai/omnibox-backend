import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TaskCallbackDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsOptional()
  exception: Record<string, any>;

  @IsOptional()
  output: Record<string, any>;
}
