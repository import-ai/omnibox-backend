import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';
import { PermissionLevel } from 'src/permissions/permission-level.enum';

export class CreateInvitationReqDto {
  namespaceRole: NamespaceRole;
  rootPermissionLevel: PermissionLevel;
  groupId?: string;
}
