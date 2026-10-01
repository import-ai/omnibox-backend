import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class InternalSystemMessageRequestDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  parent_message_id?: string;

  @IsOptional()
  @IsString()
  client_request_id?: string;
}
