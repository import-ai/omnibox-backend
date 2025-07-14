import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'src/permissions/permission-level.enum';

export class CreateInvitationReqDto {
  namespaceRole?: NamespaceRole;
  rootPermissionLevel?: ResourcePermission;
  groupId?: string;
}
