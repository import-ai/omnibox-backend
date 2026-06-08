import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';

export class RenameTagRequestDto {
  @IsString()
  @Expose({ name: 'old_name' })
  oldName: string;

  @IsString()
  @Expose({ name: 'new_name' })
  newName: string;
}
