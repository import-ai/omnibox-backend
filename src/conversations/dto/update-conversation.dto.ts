import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateConversationDto {
  @IsString()
  @IsNotEmpty()
  title: string;
}
