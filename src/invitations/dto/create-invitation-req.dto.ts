import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

export class CreateInvitationReqDto {
  namespaceRole?: NamespaceRole;
  rootPermissionLevel?: ResourcePermission;
  groupId?: string;
}
