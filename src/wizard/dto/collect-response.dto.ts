import { IsNotEmpty, IsString } from 'class-validator';

export class CollectResponseDto {
  @IsString()
  @IsNotEmpty()
  task_id: string;

  @IsString()
  @IsNotEmpty()
  resource_id: string;
}
