import { IsOptional, IsString } from 'class-validator';

export class CreateMessageDto {
  message: Record<string, any>;

  @IsOptional()
  @IsString()
  parentId?: string;
}
