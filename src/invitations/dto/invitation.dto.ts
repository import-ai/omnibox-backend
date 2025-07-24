import { GroupDto } from 'omnibox-backend/groups/dto/group.dto';
import { NamespaceRole } from 'omnibox-backend/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'omnibox-backend/permissions/resource-permission.enum';

export class InvitationDto {
  id: string;
  namespaceRole: NamespaceRole;
  rootPermissionLevel: ResourcePermission;
  group?: GroupDto;
}
