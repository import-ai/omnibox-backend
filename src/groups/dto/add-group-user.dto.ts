import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddGroupUserDto {
  @IsString()
  @IsNotEmpty()
  @Expose({ name: 'user_id' })
  userId: string;
}
