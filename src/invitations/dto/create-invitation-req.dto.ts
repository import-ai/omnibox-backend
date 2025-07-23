import { NamespaceRole } from 'omnibox-backend/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'omnibox-backend/permissions/resource-permission.enum';

export class CreateInvitationReqDto {
  namespaceRole?: NamespaceRole;
  rootPermissionLevel?: ResourcePermission;
  groupId?: string;
}
