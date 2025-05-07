import { IsNotEmpty, IsString } from 'class-validator';
import { Expose } from 'class-transformer';

@Expose()
export class GroupDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  @IsString()
  title: string;
}
