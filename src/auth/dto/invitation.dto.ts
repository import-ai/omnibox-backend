import { Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';
import { PermissionLevel } from 'src/permissions/permission-level.enum';

export class InvitationDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  namespaceId: string;

  @Expose()
  @IsEnum(NamespaceRole)
  @IsNotEmpty()
  namespaceRole: NamespaceRole;

  @Expose()
  @IsString()
  @IsOptional()
  resourceId?: string;

  @Expose()
  @IsEnum(PermissionLevel)
  @IsOptional()
  permissionLevel?: PermissionLevel;

  @Expose()
  @IsString()
  @IsOptional()
  groupId?: string;
}
