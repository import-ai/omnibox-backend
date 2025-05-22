import { PermissionLevel } from 'src/permissions/permission-level.enum';

export class NamespaceMemberDto {
  id: string;
  email: string;
  role: string;
  username: string;
  level: PermissionLevel;
}
