import { GroupDto } from 'src/groups/dto/group.dto';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';
import { PermissionLevel } from 'src/permissions/permission-level.enum';

export class InvitationDto {
  id: string;
  namespaceRole: NamespaceRole;
  rootPermissionLevel: PermissionLevel;
  group?: GroupDto;
}

export class ListRespDto {
  invitations: InvitationDto[];
}
