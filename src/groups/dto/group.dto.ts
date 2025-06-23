import { IsNotEmpty, IsString } from 'class-validator';
import { Expose } from 'class-transformer';

export class GroupDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  id: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  @Expose()
  @IsString()
  title: string;

  @Expose()
  @IsString()
  invitationId?: string;
}
