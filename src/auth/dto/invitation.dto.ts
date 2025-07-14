import { Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'src/permissions/permission-level.enum';

// Invite a user to a group or a resource within a namespace
export class UserInvitationDto {
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
  @IsEnum(ResourcePermission)
  @IsOptional()
  permissionLevel?: ResourcePermission;

  @Expose()
  @IsString()
  @IsOptional()
  groupId?: string | null;
}
