import { GroupDto } from 'src/groups/dto/group.dto';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'src/permissions/permission-level.enum';

export class InvitationDto {
  id: string;
  namespaceRole: NamespaceRole;
  rootPermissionLevel: ResourcePermission;
  group?: GroupDto;
}
