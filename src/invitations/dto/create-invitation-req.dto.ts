import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'src/permissions/resource-permission.enum';

export class CreateInvitationReqDto {
  namespaceRole?: NamespaceRole;
  rootPermissionLevel?: ResourcePermission;
  groupId?: string;
}
