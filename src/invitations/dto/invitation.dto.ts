import { GroupDto } from 'omniboxd/groups/dto/group.dto';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

export class InvitationDto {
  id: string;
  namespaceRole: NamespaceRole;
  rootPermission: ResourcePermission;
  group?: GroupDto;
}
